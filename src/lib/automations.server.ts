/**
 * Executor das automações.
 *
 * A base de dados decide quem entra e quando a execução fica pronta (0059:
 * automation_dispatch no fim canónico da sessão, automation_runs_tick de minuto a
 * minuto, que volta a confirmar as condições). Aqui só se reservam as prontas, se
 * executa a acção e se regista o resultado. Corre no ticker do servidor (15 s) e em
 * /api/public/run-jobs; nunca no browser.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database, Json } from "@/integrations/supabase/types";
import { AUTOMATION_EVENT, type Condition, type RunFacts } from "@/lib/automations";
import { deliverOutgoing } from "@/lib/integrations.server";
import { publicAppUrl } from "@/lib/app-url.server";
import { checkoutLink } from "@/lib/room-logic";
import { safeZone } from "@/lib/schedule";
import { sendWhatsapp } from "@/lib/whatsapp.server";
import {
  conditionsAtSend,
  conditionsHold,
  groupInvite,
  guardsHold,
  lateReminder,
  MAX_LOG,
  missingLinks,
  movedTarget,
  nodeMap,
  quietUntil,
  readCanvas,
  readSteps,
  renderMessage,
  runLog,
  sendMissing,
  timeLeft,
  walk,
  type ActionNode,
  type LogEntry,
  type Send,
  type Steps,
  type WalkResult,
} from "@/lib/workflow";

/** O endereço público da aplicação, para o link da sala nas mensagens. */
const APP_URL = publicAppUrl();

type Run = Database["public"]["Tables"]["automation_runs"]["Row"];
type Outcome = { ok: boolean; transient: boolean; result: Json; error: string | null };

/**
 * O link da sala com quem é a pessoa (?nome=&email=, como a sala lê): quem o abre noutro
 * aparelho entra sem se inscrever de novo. O mesmo link vai no email, no WhatsApp e no webhook.
 */
function roomLink(base: string, contact: { name: string | null; email: string | null }) {
  const who = new URLSearchParams();
  if (contact.name) who.set("nome", contact.name);
  if (contact.email) who.set("email", contact.email);
  const query = who.toString();
  return query ? `${base}${base.includes("?") ? "&" : "?"}${query}` : base;
}

/** O mesmo link sem a pessoa: para o grupo, onde todos o abrem. */
function sharedLink(url: string | null) {
  if (!url) return url;
  const [base, search = ""] = url.split("?") as [string, string?];
  const rest = new URLSearchParams(search);
  rest.delete("nome");
  rest.delete("email");
  const query = rest.toString();
  return query ? `${base}?${query}` : base;
}

/** Uma leitura falhada é uma falha passageira, nunca "não existe". */
function must<T>(result: { data: T; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

/** A reserva de claim_automation_runs (0059). */
const LOCK_MS = 2 * 60_000;

/** Outra passagem retomou a execução (a reserva expirou): esta pára sem enviar nem gravar. */
class LockLost extends Error {}

/**
 * Renova a reserva antes de cada envio que sai da plataforma. Só renova quem ainda a tem: a
 * mesma execução, a correr, com as tentativas da reserva (cada nova reserva soma uma). Assim
 * uma execução que demorou mais do que a reserva nunca envia o que outra passagem vai enviar.
 */
async function holdLock(run: Run) {
  const renewed = must(
    await supabaseAdmin
      .from("automation_runs")
      .update({ locked_until: new Date(Date.now() + LOCK_MS).toISOString() })
      .eq("id", run.id)
      .eq("status", "running")
      .eq("attempts", run.attempts)
      .select("id"),
    "reserva",
  );
  if (!renewed?.length) throw new LockLost(`[automations] ${run.id}: a reserva expirou; outra passagem retoma a execução.`);
}

/** Os dados da execução, sempre dentro da organização da execução. */
async function payloadFor(run: Run) {
  const org = run.organization_id;
  const [automation, contact, webinar, session, event] = await Promise.all([
    supabaseAdmin.from("automations").select("id, name, trigger_event, workflow_id").eq("id", run.automation_id).eq("organization_id", org).maybeSingle(),
    supabaseAdmin.from("contacts").select("id, name, email, phone, first_source, first_campaign").eq("id", run.contact_id).eq("organization_id", org).maybeSingle(),
    run.webinar_id
      ? supabaseAdmin
          .from("webinars")
          .select("id, public_title, internal_name, slug, timezone, cta_url, cta_price_now, offer_utm, replay_enabled")
          .eq("id", run.webinar_id)
          .eq("organization_id", org)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    run.webinar_session_id
      ? supabaseAdmin.from("webinar_sessions").select("id, starts_at, ends_at").eq("id", run.webinar_session_id).eq("organization_id", org).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin.from("activity_events").select("name, occurred_at, data").eq("id", run.event_id).eq("organization_id", org).maybeSingle(),
  ]);
  const a = must(automation, "automação");
  const ev = must(event, "evento");
  const c = must(contact, "contacto");
  const w = must(webinar, "webinar");
  const s = must(session, "sessão");
  if (!a || !c) return null;
  // O grupo de WhatsApp desenhado no Fluxo do workflow desta automação.
  const workflow = a.workflow_id
    ? must(
        await supabaseAdmin.from("automation_workflows").select("canvas").eq("id", a.workflow_id).eq("organization_id", org).maybeSingle(),
        "workflow",
      )
    : null;
  return {
    run_id: run.id,
    automation: { id: a.id, name: a.name },
    trigger: { event: a.trigger_event, event_id: run.event_id, occurred_at: ev?.occurred_at ?? null },
    // Nos gatilhos de pagamento: o pagamento que mudou de estado.
    purchase: purchaseOf(ev?.data),
    webinar: w ? { id: w.id, title: w.public_title || w.internal_name, timezone: w.timezone } : null,
    // O link tal como está; `utm` diz se o organizador quer a origem nele (o botão da sala respeita o mesmo).
    offer: w?.cta_url ? { url: w.cta_url, price: w.cta_price_now || null, utm: w.offer_utm !== false } : null,
    group_url: groupInvite(readCanvas(workflow?.canvas)),
    room_url: w ? roomLink(`${APP_URL}/w/${w.slug}`, c) : null,
    // O replay público é a sala com ?replay=1; /replay/<id> é a pré-visualização da equipa.
    replay_url: w?.replay_enabled ? roomLink(`${APP_URL}/w/${w.slug}?replay=1`, c) : null,
    session: s ? { id: s.id, starts_at: s.starts_at, ends_at: s.ends_at } : null,
    // first_source/first_campaign: o anúncio que trouxe a pessoa (primeiro toque, 0046).
    contact: { id: c.id, name: c.name, email: c.email, phone: c.phone, first_source: c.first_source, first_campaign: c.first_campaign },
    facts: run.facts,
  };
}

function purchaseOf(data: unknown) {
  const d = (data ?? {}) as Record<string, unknown>;
  if (typeof d["purchase_id"] !== "string") return null;
  return { id: d["purchase_id"], status: d["status"], product: d["product"], amount: d["amount"], currency: d["currency"] };
}

async function execute(run: Run): Promise<Outcome> {
  let data: Awaited<ReturnType<typeof payloadFor>>;
  try {
    data = await payloadFor(run);
  } catch (error) {
    return { ok: false, transient: true, result: null, error: error instanceof Error ? error.message : String(error) };
  }
  if (!data) return { ok: false, transient: false, result: null, error: "A automação ou o contacto já não existem." };
  await holdLock(run);
  const delivery = await deliverOutgoing(run.organization_id, AUTOMATION_EVENT, data, {
    deliveryId: run.id,
    attempt: run.attempts,
    webinarId: run.webinar_id ?? null,
  });
  return {
    ok: delivery.ok,
    transient: delivery.transient,
    result: {
      action: "outgoing_webhook",
      http_status: delivery.status,
      ms: delivery.ms,
      attempt: run.attempts,
      // Conta de teste: fica o que teria sido enviado, para se ver na execução.
      ...(delivery.sandbox ? { sandbox: true, payload: JSON.parse(JSON.stringify(data)) as Json } : {}),
    },
    error: delivery.error,
  };
}

/* ---------- Automações com passos (0063) ---------- */

type StepAutomation = {
  id: string;
  name: string;
  trigger_event: string;
  conditions: Json;
  steps: Json | null;
  organizations: { is_test: boolean } | null;
};

/** Os factos de agora: da sessão nos gatilhos de sessão, do contacto nos outros. */
async function currentFacts(run: Run): Promise<RunFacts> {
  if (run.occurrence_key.startsWith("webinar_session_") && run.webinar_session_id) {
    // Só a linha desta pessoa sai da base de dados, e não as de todos os inscritos da sessão.
    // ponytail: a função ainda agrega a sessão inteira (SET search_path impede que o filtro entre
    // nela); um parâmetro _contact_id na automation_session_facts resolve, com migration.
    const row = must(
      await supabaseAdmin
        .rpc("automation_session_facts", { _session_id: run.webinar_session_id })
        .eq("contact_id", run.contact_id)
        .maybeSingle(),
      "factos da sessão",
    );
    return (row?.facts ?? {}) as RunFacts;
  }
  const facts = must(
    await supabaseAdmin.rpc("automation_contact_facts", { _contact_id: run.contact_id, _webinar_id: run.webinar_id }),
    "factos do contacto",
  );
  return (facts ?? {}) as RunFacts;
}

const mask = (value: string | null | undefined) =>
  value ? value.replace(/^(.{2}).*(.{3})$/, (_m, a: string, b: string) => `${a}…${b}`) : null;

/**
 * Uma mensagem para um grupo sai uma vez por sessão (sem sessão: por webinar), não uma vez por
 * pessoa: se outra execução da mesma automação já a enviou nesse passo, esta só o regista.
 * Só conta um envio que saiu (ou foi simulado): um que falhou não impede o seguinte.
 * ponytail: verificação antes do envio, sem trinco (o executor corre as execuções uma a uma);
 * com vários servidores a executar ao mesmo tempo, uma chave única por automação, passo, grupo e sessão.
 */
async function groupAlreadySent(
  run: Run,
  nodeId: string,
  send: Send,
  status: "delivered" | "simulated",
) {
  if (!run.webinar_session_id && !run.webinar_id) return false;
  const query = supabaseAdmin
    .from("automation_runs")
    .select("id")
    .eq("automation_id", run.automation_id)
    .neq("id", run.id)
    // jsonb: o valor vai em JSON (um array JS seria enviado como array do Postgres).
    .contains(
      "steps_log",
      JSON.stringify([
        {
          node: nodeId,
          sends: [{ channel: send.channel, target: "group", to: send.group ?? null, status }],
        },
      ]),
    )
    .limit(1);
  const scoped = run.webinar_session_id
    ? query.eq("webinar_session_id", run.webinar_session_id)
    : query.eq("webinar_id", run.webinar_id!);
  return Boolean(must(await scoped, "envios ao grupo")?.length);
}

/** Uma mensagem: cada envio pelo seu canal. O webhook e o WhatsApp não oficial (WAHA) têm
 * fornecedor real; na conta de teste tudo é simulado e nada sai da plataforma. */
async function executeAction(
  run: Run,
  node: ActionNode,
  isTest: boolean,
  data: NonNullable<Awaited<ReturnType<typeof payloadFor>>>,
): Promise<Outcome & { entry: LogEntry }> {
  const session = data.session;
  const when = session?.starts_at ? new Date(session.starts_at) : null;
  // A data e a hora da sessão no fuso do webinar, nunca no do servidor.
  const timeZone = safeZone(data.webinar?.timezone);
  const vars = {
    nome: data.contact.name,
    primeiro_nome: (data.contact.name ?? "").split(" ")[0] ?? "",
    email: data.contact.email,
    webinar: data.webinar?.title ?? "",
    data: when ? when.toLocaleDateString("pt-PT", { day: "2-digit", month: "long", timeZone }) : "",
    hora: when ? when.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone }) : "",
    // Quanto falta para a sessão desta pessoa (a da sua inscrição), contado agora, no envio.
    falta: timeLeft(session ? { startsAt: session.starts_at, endsAt: session.ends_at } : null, new Date(), timeZone),
    link: data.room_url,
    link_oferta: data.offer?.url ?? "",
    preco: data.offer?.price ?? "",
    link_grupo: data.group_url ?? "",
    link_replay: data.replay_url ?? "",
    produto: typeof data.purchase?.product === "string" ? data.purchase.product : "",
  };
  /**
   * As variáveis deste disparo. Para o grupo, o link da sala sem a pessoa (todos o abrem). O link
   * da oferta leva a origem como o botão da sala (checkoutLink): o anúncio que trouxe a pessoa
   * (nunca no grupo) e o canal por onde clicou (utm_content=email-00m00s / whatsapp-00m00s).
   * O webhook recebe o link tal como está (data.offer.url): quem o recebe compõe a sua mensagem.
   * ponytail: o SMS sai com o link tal como está até OfferPlace (room-logic.ts) o prever.
   */
  const varsFor = (send: Send) => {
    const v = { ...vars };
    const group = send.target === "group";
    if (group) Object.assign(v, { link: sharedLink(data.room_url), link_replay: sharedLink(data.replay_url) ?? "" });
    const url = data.offer?.url;
    if (url && data.offer?.utm !== false && (send.channel === "email" || send.channel === "whatsapp")) {
      const who = group ? {} : { source: data.contact.first_source, campaign: data.contact.first_campaign };
      v.link_oferta = checkoutLink(url, { ...who, place: send.channel, seconds: 0 });
    }
    return v;
  };
  const entry: LogEntry = { node: node.id, kind: "action", at: new Date().toISOString(), outcome: "", sends: [] };
  if (node.sends.length === 0) {
    entry.outcome = "Sem envios configurados";
    return { ok: true, transient: false, result: { action: "steps", node: node.id }, error: null, entry };
  }
  // Nada sai com um link vazio: nem a mensagem com o botão sem destino, nem as outras do passo.
  const noLink = missingLinks(node.sends.flatMap((s) => [s.subject, s.message]), vars);
  if (noLink.length) {
    entry.outcome = `A mensagem usa ${noLink.join(", ")}`;
    return { ok: false, transient: false, result: null, error: entry.outcome, entry };
  }
  for (const send of node.sends) {
    const missing = sendMissing(send);
    if (missing.length) {
      entry.outcome = `Mensagem por configurar (falta ${missing.join(", ")})`;
      return { ok: false, transient: false, result: null, error: entry.outcome, entry };
    }
    const sendVars = varsFor(send);
    const to =
      send.target === "group"
        ? (send.group ?? null)
        : send.channel === "email"
          ? mask(data.contact.email)
          : send.channel === "webhook"
            ? null
            : mask(data.contact.phone);
    if (send.channel === "webhook") {
      await holdLock(run);
      const delivery = await deliverOutgoing(
        run.organization_id,
        AUTOMATION_EVENT,
        { ...data, step: { id: node.id, label: node.label ?? null } },
        { deliveryId: `${run.id}:${node.id}`, attempt: run.attempts, webinarId: run.webinar_id ?? null },
      );
      entry.sends!.push({
        channel: "webhook",
        target: "webhook",
        to: null,
        status: delivery.ok ? (delivery.sandbox ? "simulated" : "delivered") : "failed",
        http_status: delivery.status,
        error: delivery.error,
      });
      if (!delivery.ok) {
        entry.outcome = delivery.error ?? "O webhook falhou";
        return { ok: false, transient: delivery.transient, result: { action: "steps", node: node.id, http_status: delivery.status }, error: entry.outcome, entry };
      }
      continue;
    }
    if (send.channel === "whatsapp" && !isTest) {
      if (send.target === "group" && (await groupAlreadySent(run, node.id, send, "delivered"))) {
        entry.sends!.push({ channel: "whatsapp", target: "group", to, status: "shared" });
        continue;
      }
      await holdLock(run);
      const delivery = await sendWhatsapp(
        run.organization_id,
        send.target === "group" ? { group: send.group ?? "" } : { phone: data.contact.phone },
        renderMessage(send.message, sendVars),
      );
      entry.sends!.push({
        channel: "whatsapp",
        target: send.target,
        to,
        status: delivery.ok ? "delivered" : "failed",
        http_status: delivery.status,
        error: delivery.error,
      });
      if (!delivery.ok) {
        entry.outcome = delivery.error ?? "O WhatsApp falhou";
        return {
          ok: false,
          transient: delivery.transient,
          result: { action: "steps", node: node.id, http_status: delivery.status },
          error: entry.outcome,
          entry,
        };
      }
      continue;
    }
    if (!isTest) {
      entry.outcome = `Sem fornecedor de ${send.channel} configurado`;
      return { ok: false, transient: false, result: null, error: entry.outcome, entry };
    }
    if (send.target === "group" && (await groupAlreadySent(run, node.id, send, "simulated"))) {
      entry.sends!.push({ channel: send.channel, target: "group", to, status: "shared" });
      continue;
    }
    entry.sends!.push({ channel: send.channel, target: send.target, to, status: "simulated" });
    // Conta de teste: fica a mensagem que teria saído, para se ver na execução.
    (entry as LogEntry & { preview?: unknown[] }).preview = [
      ...(((entry as LogEntry & { preview?: unknown[] }).preview ?? []) as unknown[]),
      { channel: send.channel, subject: renderMessage(send.subject, sendVars) || null, message: renderMessage(send.message, sendVars) },
    ];
  }
  entry.outcome = isTest ? "Enviada (simulado: nada saiu da plataforma)" : "Enviada";
  return {
    ok: true,
    transient: false,
    result: { action: "steps", node: node.id, sandbox: isTest || undefined } as Json,
    error: null,
    entry,
  };
}

/** A gravação não mudou nenhuma linha: a execução já não estava reservada por esta passagem. */
function lostLock(run: Run, what: string) {
  console.error(`[automations] ${what} de ${run.id} sem efeito: a reserva já tinha expirado.`);
}

/** Grava o avanço. Um passo seguinte sem espera fica pronto e segue na próxima reserva. */
async function advance(
  run: Run,
  status: "next" | "done" | "cancelled" | "failed",
  w: Partial<WalkResult>,
  log: LogEntry[],
  result: Json | null,
  error: string | null,
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { data, error: rpcError } = await supabaseAdmin.rpc("advance_automation_run", {
      _run_id: run.id,
      _status: status,
      _cursor: w.cursor ?? null,
      _scheduled_for: w.scheduledFor ? w.scheduledFor.toISOString() : null,
      _guards: (w.guards ?? null) as Json,
      _log: log as unknown as Json,
      _result: result,
      _error: error,
    });
    if (!rpcError) {
      if (data === null) lostLock(run, "O passo");
      return;
    }
    console.error(`[automations] passo de ${run.id} não gravado (tentativa ${attempt})`, rpcError.message);
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
}

/** Um passo de uma execução com passos: no máximo uma mensagem por reserva. */
async function stepRun(run: Run, automation: StepAutomation, steps: Steps): Promise<void> {
  const map = nodeMap(steps);
  const now = new Date();
  if (runLog(run).length >= MAX_LOG) return advance(run, "failed", {}, [], null, "Demasiados passos nesta execução.");
  let facts: RunFacts;
  let data: Awaited<ReturnType<typeof payloadFor>>;
  try {
    [facts, data] = await Promise.all([currentFacts(run), payloadFor(run)]);
  } catch (error) {
    return finish(run, { ok: false, transient: true, result: null, error: error instanceof Error ? error.message : String(error) });
  }
  if (!data) return advance(run, "failed", {}, [], null, "A automação ou o contacto já não existem.");
  const session = data.session ? { startsAt: data.session.starts_at, endsAt: data.session.ends_at } : null;
  const guards = (Array.isArray(run.guards) ? run.guards : []) as Condition[];
  const entry = (Array.isArray(automation.conditions) ? automation.conditions : []) as Condition[];
  const timeZone = safeZone(data.webinar?.timezone);
  const ctx = { now, facts, session, guards, timeZone };
  /** A mensagem fica para mais tarde, no mesmo passo, com o motivo no registo. */
  const later = (nodeId: string, until: Date, outcome: string) =>
    advance(run, "next", { cursor: nodeId, scheduledFor: until, guards }, [{ node: nodeId, kind: "action", at: now.toISOString(), outcome }], null, null);
  const local = (d: Date) => d.toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short", timeZone });

  const cursor = run.cursor ?? steps.start;
  const node = cursor ? map.get(cursor) : undefined;
  if (node?.kind === "action") {
    // Antes de cada mensagem: a pessoa ainda cumpre as condições de entrada e as do caminho?
    if (!conditionsHold(conditionsAtSend(automation.trigger_event, entry), facts) || !guardsHold(conditionsAtSend(automation.trigger_event, guards), facts)) {
      return advance(
        run,
        "cancelled",
        { cursor },
        [{ node: node.id, kind: "action", at: now.toISOString(), outcome: "Já não cumpre as condições: a mensagem não sai" }],
        { cancelled: "conditions", facts } as Json,
        null,
      );
    }
    // A sessão passou para mais tarde depois do agendamento: a mensagem acompanha a hora nova.
    const moved = movedTarget(steps, node.id, now, session, timeZone);
    if (moved) return later(node.id, moved, `A sessão mudou de hora: a mensagem passa para ${local(moved)}`);
    // Lembrete "antes da sessão" que o executor apanhou fora de horas: não sai, o fluxo segue.
    if (lateReminder(steps, node.id, now, session, timeZone)) {
      const w = walk(steps, node.next, ctx);
      const skipped: LogEntry = { node: node.id, kind: "action", at: now.toISOString(), outcome: "A hora já tinha passado: a mensagem não sai" };
      return advance(run, w.status, w, [skipped, ...w.log], null, w.error ?? null);
    }
    const quiet = quietUntil(steps, node, { trigger: automation.trigger_event, now, session, timeZone });
    if (quiet) return later(node.id, quiet, `Horas de silêncio (22h–8h): o WhatsApp e o SMS ficam para ${local(quiet)}`);
    const outcome = await executeAction(run, node, Boolean(automation.organizations?.is_test), data);
    if (!outcome.ok) {
      if (!outcome.transient) return advance(run, "failed", { cursor }, [outcome.entry], outcome.result, outcome.error);
      return finish(run, outcome);
    }
    const w = walk(steps, node.next, ctx);
    return advance(run, w.status, w, [outcome.entry, ...w.log], outcome.result, w.error ?? null);
  }
  const w = walk(steps, cursor, ctx);
  return advance(run, w.status, w, w.log, null, w.error ?? null);
}

async function finish(run: Run, outcome: Outcome) {
  // Gravar o resultado importa mais do que a pressa: sem ele, a execução voltava à fila.
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const { data, error: finishError } = await supabaseAdmin.rpc("finish_automation_run", {
      _run_id: run.id,
      _ok: outcome.ok,
      _transient: outcome.transient,
      _result: outcome.result,
      _error: outcome.error,
    });
    if (!finishError) {
      if (data === null) lostLock(run, "O resultado");
      return;
    }
    console.error(`[automations] resultado de ${run.id} não gravado (tentativa ${attempt})`, finishError.message);
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
}

/** Uma execução reservada: com passos (0063) ou a acção única do Bloco 4. */
async function runOne(run: Run) {
  try {
    const { data: automation, error } = await supabaseAdmin
      .from("automations")
      .select("id, name, trigger_event, conditions, steps, organizations(is_test)")
      .eq("id", run.automation_id)
      .eq("organization_id", run.organization_id)
      .maybeSingle();
    // Sem saber se a automação tem passos, nada corre: uma falha da leitura nunca é "sem passos".
    if (error) return await finish(run, { ok: false, transient: true, result: null, error: `automação: ${error.message}` });
    const steps = readSteps(automation?.steps);
    if (automation && steps) await stepRun(run, automation as StepAutomation, steps);
    else await finish(run, await execute(run));
  } catch (error) {
    if (error instanceof LockLost) return console.error(error.message);
    // Uma falha inesperada (ex.: leitura do grupo) fica nesta execução e não pára as outras.
    await finish(run, { ok: false, transient: true, result: null, error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * Reserva e executa as execuções prontas, uma de cada vez. Cada uma é entregue a um só
 * executor (a reserva é uma escrita condicional na base de dados), e o resultado só se grava
 * numa execução reservada: uma executada nunca volta a correr. Reservar uma de cada vez faz a
 * reserva (2 min) começar quando o executor lhe pega, e não enquanto espera atrás de um lote.
 * Uma execução com passos avança um passo por reserva; o passo seguinte sem espera fica pronto
 * e é reservado logo a seguir. Pára em `limit` execuções ou quando acaba o tempo.
 * ponytail: o tempo só se confirma entre execuções; uma execução pode durar até ~1 min
 * (6 webhooks de 10 s). Um prazo por envio, se o endpoint agendado tiver um limite mais curto.
 */
export async function runDueAutomations({ limit = 50, budgetMs = 30_000 } = {}) {
  const started = Date.now();
  let executed = 0;
  while (executed < limit && Date.now() - started < budgetMs) {
    const { data: runs, error } = await supabaseAdmin.rpc("claim_automation_runs", { _limit: 1 });
    if (error) throw new Error(error.message);
    const run = runs?.[0];
    if (!run) break;
    executed += 1;
    await runOne(run);
  }
  return { executed };
}
