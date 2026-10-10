#!/usr/bin/env node
/**
 * Cenário de teste: a conta "NOVAWEBINAR — TESTE" com 15 contactos fictícios, um webinar
 * com sessão e oferta, pagamentos e automações, a passar pelos caminhos reais da plataforma.
 *
 *   node scripts/cenario-teste.mjs criar --dono <email da sua conta> [--app http://localhost:8080]
 *   node scripts/cenario-teste.mjs estado
 *   node scripts/cenario-teste.mjs limpar
 *   node scripts/cenario-teste.mjs workflow   (depois de «Criar automação base» no webinar de teste)
 *   node scripts/cenario-teste.mjs fluxo [--app URL]   (webinar curto: inscrição pela API → fim → recuperação)
 *   node scripts/cenario-teste.mjs comercio [--app URL]   (compra, falha, abandono, reembolso, duplicados, atribuição, automações)
 *
 * Caminhos reais: a sessão abre como na inscrição (open_webinar_session); o tempo visto entra
 * pela função da sala (record_participant_progress, com os mesmos limites); os pagamentos
 * entram pelo receptor de webhooks da aplicação (--app tem de estar a correr); o fim da
 * sessão é dado pelo pg_cron; as automações são executadas pelo servidor da aplicação.
 * A inscrição e a oferta gravam as mesmas linhas que joinPublicRoom e recordCta.
 *
 * A conta é de teste (organizations.is_test): o webhook de saída é simulado no servidor e
 * nada sai da plataforma. "limpar" só apaga esta conta, e só se estiver marcada como teste.
 * Lê o .env; nenhum segredo é impresso.
 */
import { readFileSync } from "node:fs";

const SLUG = "novawebinar-teste";
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const [command, ...rest] = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
const APP = arg("app", "http://localhost:8080").replace(/\/+$/, "");
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function db(path, init = {}) {
  // O gateway às vezes responde 5xx: repete até 3 vezes (num cenário de teste, um raro duplicado não estraga nada).
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...(init.headers ?? {}) },
    });
    const text = await response.text();
    if (response.status >= 500 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      continue;
    }
    if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path.split("?")[0]}: ${response.status} ${text.slice(0, 300)}`);
    return text ? JSON.parse(text) : null;
  }
}
const insert = async (table, row) =>
  (await db(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(row) }))[0];
const rpc = (name, args = {}) => db(`rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clock = () => new Date().toLocaleTimeString("pt-PT");
const say = (message) => console.log(`[${clock()}] ${message}`);

/**
 * Cenários. watch = segundos vistos (cada participação); offer = "view" (viu) ou "click"
 * (viu e clicou); payment = estados enviados pela plataforma de venda, por ordem.
 */
const PEOPLE = [
  { name: "Carlos Manuel António", email: "carlos.antonio@example.com", phone: "+244 000 000 001", watch: [2700], offer: "view" },
  { name: "Ana Paula Domingos", email: "ana.domingos@example.com", phone: "+244 000 000 002", watch: [] },
  { name: "João Pedro Miguel", email: "joao.miguel@example.com", phone: "+244 000 000 003", watch: [3000], offer: "click" },
  { name: "Maria José Francisco", email: "maria.francisco@example.com", phone: "+244 000 000 004", watch: [3000], offer: "view", payment: ["pending", "abandoned"] },
  { name: "Paulo André Joaquim", email: "paulo.joaquim@example.com", phone: "+244 000 000 005", watch: [3000], offer: "click", payment: ["approved"] },
  { name: "Isabel Teresa Manuel", email: "isabel.manuel@example.com", phone: "+244 000 000 006", watch: [40] },
  { name: "António Filipe Gomes", email: "antonio.gomes@example.com", phone: "+244 000 000 007", watch: [2900], payment: ["pending", "failed"] },
  { name: "Sandra Cristina Alves", email: "sandra.alves@example.com", phone: "+244 000 000 008", watch: [3000], offer: "click", payment: ["approved"] },
  { name: "Daniel Sebastião Costa", email: "daniel.costa@example.com", phone: "+244 000 000 009", watch: [] },
  { name: "Helena Sofia Mateus", email: "helena.mateus@example.com", phone: "+244 000 000 010", watch: [2600], offer: "view" },
  { name: "Ricardo José António", email: "ricardo.antonio@example.com", phone: "+244 000 000 011", watch: [180, 1800] },
  { name: "Patrícia Isabel Silva", email: "patricia.silva@example.com", phone: "+244 000 000 012", watch: [2800], offer: "click", payment: ["pending", "abandoned"] },
  { name: "Manuel Domingos Pedro", email: "manuel.pedro@example.com", phone: "+244 000 000 013", watch: [3000], payment: ["approved"] },
  { name: "Teresa Maria Joaquim", email: "teresa.joaquim@example.com", phone: "+244 000 000 014", watch: [2700], payment: ["pending", "failed"] },
  { name: "Luís Fernando Martins", email: "luis.martins@example.com", phone: "+244 000 000 015", watch: [2500], offer: "view" },
];
const OFFER_SECOND = 2400;
const ATTENDED = [{ fact: "attended", value: true }, { fact: "purchased", value: false }];
// Os 4 modelos da página de Automações, mais duas para se verem os outros estados:
// "Pedir depoimento" fica a aguardar (1 dia) e "Clicou e ainda não comprou" falha (o destino
// de teste recusa). A recuperação espera 2 minutos em vez de 2 horas, para se ver a acontecer.
const AUTOMATIONS = [
  { key: "recovery", name: "Recuperação pós-webinar", trigger_event: "webinar_session_ended", conditions: ATTENDED, wait_minutes: 2 },
  { key: "abandoned", name: "Checkout abandonado", trigger_event: "checkout_abandoned", conditions: [], wait_minutes: 0 },
  { key: "failed", name: "Pagamento falhou", trigger_event: "payment_failed", conditions: [], wait_minutes: 0 },
  { key: "welcome", name: "Pós-compra", trigger_event: "purchase_approved", conditions: [], wait_minutes: 0 },
  { key: "review", name: "Pós-compra: pedir depoimento", trigger_event: "purchase_approved", conditions: [], wait_minutes: 1440 },
  { key: "clicked", name: "Clicou e ainda não comprou", trigger_event: "offer_clicked", conditions: [{ fact: "purchased", value: false }], wait_minutes: 0 },
];
const FINAL = ["done", "failed", "cancelled"];

async function testOrganization() {
  const [org] = await db(`organizations?select=id,name,is_test&slug=eq.${SLUG}`);
  return org ?? null;
}

async function create() {
  const owner = arg("dono");
  if (!owner) throw new Error("Indique a sua conta: --dono <email com que entra na plataforma>.");
  if (await testOrganization()) throw new Error("A conta de teste já existe. Corra primeiro: node scripts/cenario-teste.mjs limpar");
  const appUp = await fetch(APP).then((r) => r.ok, () => false);
  if (!appUp) throw new Error(`A aplicação não responde em ${APP}. Arranque-a (npm run dev) ou indique --app.`);
  const ownerId = await rpc("auth_user_id_for_email", { _email: owner });
  if (!ownerId) throw new Error("Não há nenhuma conta com esse email.");

  // 1. Conta de teste, com a sua conta como dona (aparece no seletor de espaço de trabalho).
  const org = await insert("organizations", { name: "NOVAWEBINAR — TESTE", slug: SLUG, created_by: ownerId, is_test: true });
  await insert("organization_members", { organization_id: org.id, user_id: ownerId, role: "owner" });
  say(`Conta de teste criada (${org.id.slice(0, 8)}).`);

  // 2. Sessão ao vivo que começou há 54 minutos e termina daqui a ~6: o pg_cron dá-a como terminada.
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() - 54);
  const end = new Date(start.getTime() + 3600_000);
  const webinar = await insert("webinars", {
    organization_id: org.id,
    created_by: ownerId,
    internal_name: "Teste · Aula ao vivo",
    public_title: "Aula ao vivo: vender mais com webinars (teste)",
    slug: "teste-aula-ao-vivo",
    status: "scheduled",
    schedule_mode: "scheduled",
    scheduled_at: start.toISOString(),
    timezone: "Africa/Luanda",
    duration_seconds: 3600,
    pitch_seconds: 2100,
    cta_text: "Quero entrar no programa",
    cta_url: "https://exemplo.invalid/checkout/programa-teste",
    cta_start_seconds: OFFER_SECOND,
  });
  const sessionId = await rpc("open_webinar_session", {
    _webinar_id: webinar.id,
    _starts_at: start.toISOString(),
    _ends_at: end.toISOString(),
  });
  say(`Webinar e sessão ${start.toLocaleTimeString("pt-PT")}–${end.toLocaleTimeString("pt-PT")} criados.`);

  // 3. Integrações de teste: receptor de vendas (genérico) e webhook de saída simulado.
  const sales = await insert("integrations", { organization_id: org.id, provider: "webhook", enabled: true });
  const TEST_URL = "https://destino-de-teste.novawebinar.invalid/webhook";
  const simulate = (mode) =>
    db(`integrations?organization_id=eq.${org.id}&provider=eq.outgoing_webhook`, {
      method: "PATCH",
      body: JSON.stringify({ settings: { url: TEST_URL, simulate: mode } }),
    });
  // Durante a oferta o destino de teste recusa: "Clicou e ainda não comprou" fica falhada.
  await insert("integrations", {
    organization_id: org.id,
    provider: "outgoing_webhook",
    enabled: true,
    secret: crypto.randomUUID().replace(/-/g, ""),
    settings: { url: TEST_URL, simulate: "reject" },
  });

  // 4. Automações.
  const ids = {};
  for (const { key, ...automation } of AUTOMATIONS) {
    ids[key] = (await insert("automations", { organization_id: org.id, active: true, ...automation })).id;
  }
  const runsOf = async (keys) =>
    (await db(`automation_runs?select=status,automation_id&organization_id=eq.${org.id}`)).filter((r) =>
      keys.some((k) => ids[k] === r.automation_id),
    );
  say(`${AUTOMATIONS.length} automações activas criadas.`);

  // 5. Inscrições e tempo visto, pela função da sala. Cada pessoa em paralelo; as visitas
  // da mesma pessoa uma a uma (o contacto nasce na primeira).
  const participants = new Map();
  await Promise.all(
    PEOPLE.map(async (person, index) => {
      const visits = person.watch.length ? person.watch : [0];
      for (const [visit, seconds] of visits.entries()) {
        const offsetMinutes = visit === 0 ? index % 4 : 20;
        const joined = new Date(start.getTime() + offsetMinutes * 60_000);
        const participant = await insert("participants", {
          webinar_id: webinar.id,
          organization_id: org.id,
          name: person.name,
          email: person.email,
          phone: person.phone,
          viewing_mode: "live",
          device: index % 2 ? "mobile" : "desktop",
          city: "Luanda",
          country: "Angola",
          country_code: "AO",
          joined_at: joined.toISOString(),
          webinar_session_id: sessionId,
        });
        participants.set(person.email, participant);
        const entry = offsetMinutes * 60;
        let position = entry;
        for (let watched = 0; watched < seconds; ) {
          const step = Math.min(120, seconds - watched);
          watched += step;
          position += step;
          await rpc("record_participant_progress", {
            _participant_id: participant.id,
            _position: position,
            _entry: entry,
            _played: step,
          });
        }
      }
    }),
  );
  say("15 inscrições registadas (Ricardo com 2 participações), com o tempo visto de cada um.");

  // 6. Oferta: as mesmas linhas que recordCta grava.
  for (const person of PEOPLE.filter((p) => p.offer)) {
    const participant = participants.get(person.email);
    await insert("cta_events", {
      organization_id: org.id,
      webinar_id: webinar.id,
      participant_id: participant.id,
      event_type: "view",
      video_second: OFFER_SECOND,
    });
    if (person.offer === "click") {
      await insert("cta_events", {
        organization_id: org.id,
        webinar_id: webinar.id,
        participant_id: participant.id,
        event_type: "click",
        video_second: OFFER_SECOND + 60,
      });
      await db(`participants?id=eq.${participant.id}`, { method: "PATCH", body: JSON.stringify({ cta_clicked: true }) });
    }
  }
  say("Oferta vista e clicada conforme o cenário.");
  await waitFor("execuções de quem clicou", async () => {
    const runs = await runsOf(["clicked"]);
    return runs.length === 4 && runs.every((r) => FINAL.includes(r.status));
  }, 2 * 60_000);
  await simulate("ok");
  say("Quem clicou entrou em \"Clicou e ainda não comprou\"; o destino de teste recusou (falha visível).");

  // 7. Pagamentos pelo receptor real de webhooks da aplicação.
  for (const person of PEOPLE.filter((p) => p.payment)) {
    for (const status of person.payment) {
      const response = await fetch(`${APP}/api/public/hooks/${sales.endpoint_key}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: `teste-${person.email.split("@")[0]}`,
          status,
          email: person.email,
          name: person.name,
          phone: person.phone,
          product: "Programa Vender com Webinars (teste)",
          amount: 25000,
          currency: "AOA",
        }),
      });
      if (!response.ok) throw new Error(`O receptor recusou o pagamento de ${person.name}: HTTP ${response.status}`);
    }
  }
  say("Pagamentos enviados: 3 aprovados, 2 falhados, 2 abandonados.");
  if (Date.now() > end.getTime() - 60_000) {
    throw new Error("O cenário não ficou pronto antes do fim da sessão. Corra limpar e depois criar outra vez.");
  }

  // 8. As automações de pagamento correm já; o depoimento fica a aguardar 1 dia. Depois disso,
  // a 1.ª tentativa da recuperação passa a falhar (simulado), para se ver a nova tentativa.
  await waitFor("execuções dos pagamentos concluídas", async () => {
    const runs = await runsOf(["abandoned", "failed", "welcome"]);
    return runs.length === 7 && runs.every((r) => FINAL.includes(r.status));
  });
  await simulate("fail_first");
  say("Pagamentos tratados. A partir de agora a 1.ª tentativa de cada envio falha (simulado) e a 2.ª passa.");

  await waitFor("fim da sessão (pg_cron)", async () =>
    (await db(`webinar_sessions?select=ended_at&id=eq.${sessionId}`))[0]?.ended_at);
  say("A sessão terminou; a recuperação espera 2 minutos e confirma as condições.");
  await waitFor("execuções da recuperação concluídas", async () => {
    const runs = await runsOf(["recovery"]);
    return runs.length > 0 && runs.every((r) => FINAL.includes(r.status));
  }, 12 * 60_000);
  await report(org.id);
}

async function waitFor(what, check, timeoutMs = 8 * 60_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await check()) return;
    await sleep(5000);
  }
  throw new Error(`Passou o tempo à espera de: ${what}. A aplicação está a correr?`);
}

async function report(orgId) {
  const facts = await db(
    `participant_facts?select=person_id,name,attended,actual_watch_seconds,saw_offer,clicked,checkout_started,purchased,payment_failed,checkout_abandoned&organization_id=eq.${orgId}`,
  );
  const runs = await db(
    `automation_runs?select=contact_id,status,attempts,automations(name)&organization_id=eq.${orgId}`,
  );
  const people = new Map();
  for (const f of facts) {
    const p = people.get(f.person_id) ?? { ...f, participations: 0 };
    p.participations += 1;
    for (const key of ["attended", "saw_offer", "clicked", "checkout_started", "purchased", "payment_failed", "checkout_abandoned"]) {
      p[key] = p[key] || f[key];
    }
    p.actual_watch_seconds = Math.max(p.actual_watch_seconds ?? 0, f.actual_watch_seconds ?? 0);
    people.set(f.person_id, p);
  }
  const yes = (v) => (v ? "sim" : "—");
  console.table(
    [...people.values()].map((p) => ({
      nome: p.name,
      entradas: p.participations,
      assistiu: yes(p.attended),
      "min vistos": Math.round((p.actual_watch_seconds ?? 0) / 60),
      oferta: yes(p.saw_offer),
      clicou: yes(p.clicked),
      checkout: yes(p.checkout_started),
      comprou: yes(p.purchased),
      falhou: yes(p.payment_failed),
      abandonou: yes(p.checkout_abandoned),
      automações: runs
        .filter((r) => r.contact_id === p.person_id)
        .map((r) => `${r.automations?.name.split(":")[0]} (${r.status}, ${r.attempts}x)`)
        .join("; "),
    })),
  );
}

async function status() {
  const org = await testOrganization();
  if (!org) return console.log("Não há conta de teste.");
  await report(org.id);
}

async function clean() {
  const org = await testOrganization();
  if (!org) return console.log("Não há conta de teste: nada para limpar.");
  if (!org.is_test) throw new Error("Recusado: a conta com este nome não está marcada como teste.");
  // O filtro is_test vai no próprio pedido: nunca apaga uma conta real.
  await db(`organizations?id=eq.${org.id}&slug=eq.${SLUG}&is_test=eq.true`, { method: "DELETE" });
  const left = {};
  for (const table of ["contacts", "participants", "webinars", "webinar_sessions", "automations", "automation_runs", "activity_events", "real_purchase_events", "integrations", "integration_events", "cta_events", "automation_workflows", "registration_forms"]) {
    left[table] = (await db(`${table}?select=organization_id&organization_id=eq.${org.id}`)).length;
  }
  console.log("Conta de teste apagada. Linhas que ficaram:", JSON.stringify(left));
}

/* ---------- Workflow (0063): mensagens de teste, activar, aplicar às pessoas da conta ---------- */

const GROUP = "Participantes Webinar IA (teste)";

/** Mensagens fictícias para cada envio que nasceu vazio. Só na conta de teste: tudo simulado. */
function fillSends(steps) {
  for (const node of steps.nodes) {
    if (node.kind !== "action") continue;
    const label = node.label || "Mensagem";
    for (const send of node.sends) {
      if (send.channel === "webhook") continue;
      if (send.target === "group") send.group ||= GROUP;
      if (send.channel === "email") send.subject ||= `${label} · {{webinar}}`;
      send.message ||=
        send.target === "group"
          ? `${label}: o webinar «{{webinar}}» é {{data}} às {{hora}}.`
          : `Olá {{primeiro_nome}}, ${label.toLowerCase()} · {{webinar}} ({{data}}, {{hora}}).`;
    }
  }
  return steps;
}

async function workflowFor(webinarId, { wait = 0 } = {}) {
  for (let i = 0; i <= wait; i += 5) {
    const [workflow] = await db(`automation_workflows?select=id,name&webinar_id=eq.${webinarId}&archived_at=is.null`);
    if (workflow) return workflow;
    if (i < wait) await sleep(5000);
  }
  return null;
}

async function activate(workflow, adjust = (steps) => steps) {
  const automations = await db(`automations?select=id,name,steps&workflow_id=eq.${workflow.id}&order=created_at`);
  for (const a of automations) {
    const steps = adjust(fillSends(a.steps), a);
    await db(`automations?id=eq.${a.id}`, { method: "PATCH", body: JSON.stringify({ steps, active: true }) });
  }
  return automations;
}

async function prepareWorkflow() {
  const org = await testOrganization();
  if (!org?.is_test) throw new Error("Não há conta de teste.");
  const [webinar] = await db(`webinars?select=id&organization_id=eq.${org.id}&slug=eq.teste-aula-ao-vivo`);
  const workflow = await workflowFor(webinar.id);
  if (!workflow) throw new Error("Crie primeiro a automação base no webinar de teste (Webinar → Automações → Criar automação base).");
  const automations = await activate(workflow);
  say(`${automations.length} automações com mensagens de teste e activas.`);
  // As pessoas da conta entram pelas ocorrências que já aconteceram (inscrições, fim da
  // sessão, pagamentos): é daí que nascem os estados no-show, recuperação, abandono,
  // pagamento falhado, pós-compra e upsell a aguardar.
  for (const a of automations) {
    const created = await rpc("automation_apply_recent", { _automation_id: a.id, _days: 30 });
    say(`${a.name}: ${created} execuções novas`);
  }
  say("O servidor da aplicação executa-as (ticker de 15 s). A aguardar 45 s…");
  await sleep(45_000);
  await workflowReport(workflow.id);
}

async function workflowReport(workflowId) {
  const runs = await db(
    `automation_runs?select=status,cursor,scheduled_for,contacts(name),automations!inner(name,workflow_id)&automations.workflow_id=eq.${workflowId}`,
  );
  const table = {};
  for (const r of runs) {
    const key = r.automations.name;
    table[key] ??= {};
    table[key][r.status] = (table[key][r.status] ?? 0) + 1;
  }
  console.table(table);
  const waiting = runs.filter((r) => r.status === "waiting").slice(0, 8);
  for (const r of waiting) console.log(`  ● ${r.contacts.name} · ${r.automations.name} · passo ${r.cursor} às ${new Date(r.scheduled_for).toLocaleString("pt-PT")}`);
}

/* ---------- Fluxo completo: página externa → API → sessão → comportamento → pagamento → automações ---------- */

/**
 * Um webinar curto (começa daqui a 8 min e dura 4; pitch ao 1:30, oferta aos 2:00) com a
 * automação base criada na interface. Cada pessoa percorre um caminho:
 *   Helena  entra e vê a oferta; em recuperação compra (a recuperação pára); reembolso (o upsell não sai)
 *   Daniel  inscreve-se e não aparece (não entrou → não compareceu → replay)
 *   Carlos  entra tarde (minuto 1) e sai antes da oferta (saiu cedo)
 *   Maria   clica na oferta e abandona o checkout
 *   Teresa  pagamento falhado; depois paga (pós-compra e upsell)
 * Inscrições pela API pública, pagamentos pelo receptor real de webhooks, início e fim da sessão
 * pelo pg_cron, automações pelo executor do servidor. Conta de teste: nada sai da plataforma.
 */
async function flow() {
  const org = await testOrganization();
  if (!org?.is_test) throw new Error("Não há conta de teste.");
  const appUp = await fetch(APP).then((r) => r.ok, () => false);
  if (!appUp) throw new Error(`A aplicação não responde em ${APP}.`);
  const [owner] = await db(`organizations?select=created_by&id=eq.${org.id}`);
  const [sales] = await db(`integrations?select=endpoint_key&organization_id=eq.${org.id}&provider=eq.webhook`);
  if (!sales) throw new Error("A conta de teste não tem receptor de vendas.");
  const run = Date.now().toString(36);
  const product = `programa-fluxo-${run}`;

  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 8);
  const end = start.getTime() + 240_000;
  const webinar = await insert("webinars", {
    organization_id: org.id,
    created_by: owner.created_by,
    internal_name: "Teste · Fluxo completo",
    public_title: "Fluxo completo (teste)",
    slug: `teste-fluxo-${run}`,
    status: "scheduled",
    schedule_mode: "scheduled",
    scheduled_at: start.toISOString(),
    timezone: "Africa/Luanda",
    duration_seconds: 240,
    pitch_seconds: 90,
    cta_text: "Quero entrar no programa",
    cta_url: `https://exemplo.invalid/checkout/${product}`,
    cta_start_seconds: 120,
  });
  say(`Webinar «Fluxo completo (teste)» criado: começa às ${start.toLocaleTimeString("pt-PT")}.`);
  say(`Abra ${APP}/webinars/${webinar.id}/edit?step=automacoes e carregue em «Criar automação base» (espero até 6 min).`);
  const workflow = await workflowFor(webinar.id, { wait: 360 });
  if (!workflow) throw new Error("A automação base não foi criada a tempo.");

  // Esperas curtas para se ver acontecer (até 2 h → 1 min; pós-compra 2 dias → 3 min). As de 1 dia
  // ficam: é aí que se vê quem aguarda. O lembrete de 15 min passa a 2 min antes do início; a
  // recuperação 1 também envia para o webhook de teste.
  await activate(workflow, (steps, a) => {
    for (const n of steps.nodes) {
      if (n.kind === "wait" && n.mode === "delay" && n.minutes <= 120) n.minutes = 1;
      if (n.kind === "wait" && n.mode === "delay" && n.minutes === 2880) n.minutes = 3;
      if (n.kind === "wait" && n.mode === "before_session" && n.minutes === 15) n.minutes = 2;
      if (a.name === "Pós-webinar" && n.kind === "action" && n.label === "Recuperação 1")
        n.sends.push({ channel: "webhook", target: "webhook" });
    }
    return steps;
  });
  say("Automações configuradas e activas.");

  const [form] = await db(`registration_forms?select=id&webinar_id=eq.${webinar.id}`);
  await db(`registration_forms?id=eq.${form.id}`, {
    method: "PATCH",
    body: JSON.stringify({ page_name: "Página de inscrição (teste)", page_url: "https://exemplo.invalid/webinar-ia", consent_text: "Aceito receber comunicações sobre este webinar." }),
  });

  // 1. A página externa envia as inscrições (como o formulário embed ou um formulário próprio).
  const register = (person, extra = {}) =>
    fetch(`${APP}/api/public/register`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://exemplo.invalid" },
      body: JSON.stringify({
        form_id: form.id,
        name: person.name,
        email: person.email,
        phone: person.phone,
        consent: true,
        page_url: "https://exemplo.invalid/webinar-ia?utm_source=facebook&utm_medium=cpc&utm_campaign=fluxo-teste&utm_term=ia",
        referrer: "https://facebook.com/",
        ...extra,
      }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const KEYS = ["helena", "daniel", "carlos", "maria", "teresa"];
  const who = Object.fromEntries(KEYS.map((k) => [k, PEOPLE.find((p) => p.email.startsWith(k))]));
  const reg = {};
  for (const k of KEYS) {
    const r = await register(who[k], { submission_id: `fluxo-${k}-${run}` });
    if (r.status !== 201) throw new Error(`Inscrição de ${who[k].name}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
    reg[k] = r.body;
  }
  say(`API · 5 inscrições (201), cada uma com contacto: ${KEYS.every((k) => reg[k].contact_id) ? "sim" : "NÃO"}.`);
  const again = await register(who.helena, { submission_id: `fluxo-helena-${run}` });
  say(`API · Helena outra vez (mesma submissão): ${again.status} ${again.body.status} · ${again.body.registration_id === reg.helena.registration_id ? "a mesma inscrição" : "OUTRA inscrição (erro)"}`);

  // 2. A sessão: posição = segundos desde o início (sala sincronizada); cada sinal traz 15 s vistos.
  const progress = (k, position, played, entry = null) =>
    rpc("record_participant_progress", { _participant_id: reg[k].registration_id, _position: position, _entry: entry, _played: played });
  const offer = async (k, type, second) => {
    await insert("cta_events", { organization_id: org.id, webinar_id: webinar.id, participant_id: reg[k].registration_id, event_type: type, video_second: second });
    if (type === "click") await db(`participants?id=eq.${reg[k].registration_id}`, { method: "PATCH", body: JSON.stringify({ cta_clicked: true }) });
  };
  const pay = (k, status, attempt = 1) =>
    fetch(`${APP}/api/public/hooks/${sales.endpoint_key}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: `fluxo-${k}-${attempt}-${run}`, status, email: who[k].email, name: who[k].name, phone: who[k].phone, product: "Programa Vender com Webinars (teste)", product_id: product, amount: 25000, currency: "AOA" }),
    }).then((r) => {
      if (!r.ok) throw new Error(`O receptor recusou o pagamento de ${who[k].name}: HTTP ${r.status}`);
    });

  const at = async (t) => { while (Date.now() < start.getTime() + t * 1000) await sleep(1000); };
  await at(5);
  for (const k of ["helena", "maria", "teresa"]) await progress(k, 5, 5, 0);
  say("Sessão a decorrer: Helena, Maria e Teresa entraram; o Daniel não aparece.");
  for (let t = 15; t <= 225; t += 15) {
    await at(t);
    for (const k of ["helena", "maria", "teresa"]) await progress(k, t, 15);
    if (t >= 60 && t <= 105) await progress("carlos", t, 15, t === 60 ? 60 : null);
    if (t === 120) {
      await progress("carlos", 118, 13); // sai aos 1:58, antes da oferta
      for (const k of ["helena", "maria", "teresa"]) await offer(k, "view", 120);
      say("Carlos entrou ao minuto 1 e saiu antes da oferta; a oferta abriu (Helena, Maria e Teresa viram).");
    }
    if (t === 135) await offer("maria", "click", 135);
    if (t === 150) {
      await pay("maria", "abandoned");
      await pay("teresa", "failed");
      say("Maria clicou e abandonou o checkout; o pagamento da Teresa falhou.");
    }
  }

  // 3. Fim da sessão (pg_cron): o Pós-webinar decide por pessoa.
  const [{ webinar_session_id: sessionId }] = await db(`participants?select=webinar_session_id&id=eq.${reg.helena.registration_id}`);
  await waitFor("fim da sessão (pg_cron)", async () => (await db(`webinar_sessions?select=ended_at&id=eq.${sessionId}`))[0]?.ended_at, 4 * 60_000);
  say("A sessão terminou.");

  // 4. A Helena recebe a recuperação 1 e compra antes da 2: a recuperação pára. Depois é reembolsada.
  const [postWebinar] = await db(`automations?select=id&workflow_id=eq.${workflow.id}&name=eq.${encodeURIComponent("Pós-webinar")}`);
  const runOf = async (automationId, k) =>
    (await db(`automation_runs?select=id,status,cursor,steps_log&automation_id=eq.${automationId}&contact_id=eq.${reg[k].contact_id}`))[0];
  await waitFor("recuperação 1 da Helena", async () => ((await runOf(postWebinar.id, "helena"))?.steps_log ?? []).some((e) => e.node === "p5" && e.kind === "action"), 5 * 60_000);
  await pay("helena", "approved");
  say("Helena: recuperação 1 enviada; a seguir comprou (antes da recuperação 2).");
  await pay("teresa", "approved", 2);
  say("Teresa pagou à segunda tentativa.");
  const [postPurchase] = await db(`automations?select=id&workflow_id=eq.${workflow.id}&name=eq.${encodeURIComponent("Pós-compra")}`);
  await waitFor("boas-vindas da Helena", async () => ((await runOf(postPurchase.id, "helena"))?.steps_log ?? []).some((e) => e.kind === "action"), 3 * 60_000);
  await waitFor("recuperação da Helena parada", async () => (await runOf(postWebinar.id, "helena"))?.status === "cancelled", 3 * 60_000);
  await pay("helena", "refunded");
  say("Helena: a recuperação 2 não saiu (comprou) e as boas-vindas saíram; a seguir a compra foi reembolsada (antes do upsell).");

  // 5. Esperar que cada jornada chegue ao fim ou a uma espera longa (1 dia).
  const settled = async () => {
    const runs = await db(`automation_runs?select=status,scheduled_for,automations!inner(workflow_id)&automations.workflow_id=eq.${workflow.id}`);
    return runs.every((r) => FINAL.includes(r.status) || (r.status === "waiting" && Date.parse(r.scheduled_for) > Date.now() + 3600_000));
  };
  await waitFor("jornadas concluídas ou em espera longa", settled, 8 * 60_000);
  await flowReport(org.id, webinar.id, workflow.id, reg, who);
  say(`Webinar do fluxo: ${webinar.id} · workflow ${workflow.id}`);
}

async function flowReport(orgId, webinarId, workflowId, reg, who) {
  const facts = await db(`participant_facts?select=contact_id,entry_seconds,actual_watch_seconds,attended,reached_pitch,reached_offer,saw_offer,clicked,checkout_started,purchased,payment_failed,checkout_abandoned,refunded&organization_id=eq.${orgId}&webinar_id=eq.${webinarId}`);
  const yes = (v) => (v ? "sim" : "—");
  console.table(
    Object.keys(reg).map((k) => {
      const f = facts.find((x) => x.contact_id === reg[k].contact_id) ?? {};
      return {
        pessoa: who[k].name.split(" ")[0],
        entrada: f.entry_seconds == null ? "—" : `${f.entry_seconds}s`,
        visto: `${f.actual_watch_seconds ?? 0}s`,
        assistiu: yes(f.attended),
        pitch: yes(f.reached_pitch),
        "chegou à oferta": yes(f.reached_offer),
        "viu oferta": yes(f.saw_offer),
        clicou: yes(f.clicked),
        checkout: yes(f.checkout_started),
        comprou: yes(f.purchased),
        falhou: yes(f.payment_failed),
        abandonou: yes(f.checkout_abandoned),
        reembolso: yes(f.refunded),
      };
    }),
  );
  const runs = await db(`automation_runs?select=contact_id,status,cursor,scheduled_for,steps_log,result,automations!inner(name,workflow_id,steps)&automations.workflow_id=eq.${workflowId}&order=created_at`);
  const sends = { simulated: 0, delivered: 0, failed: 0 };
  for (const k of Object.keys(reg)) {
    console.log(`\n${who[k].name}`);
    for (const r of runs.filter((x) => x.contact_id === reg[k].contact_id)) {
      const label = (id) => r.automations.steps?.nodes?.find((n) => n.id === id)?.label ?? id;
      const log = (r.steps_log ?? []).map((e) => {
        for (const s of e.sends ?? []) sends[s.status] = (sends[s.status] ?? 0) + 1;
        if (e.kind === "action") return e.sends?.length ? `✉ ${label(e.node)} (${e.sends.map((s) => `${s.channel}${s.target === "group" ? "·grupo" : ""}:${s.status}`).join(", ")})` : `✗ ${label(e.node)}: ${e.outcome}`;
        if (e.kind === "branch") return e.outcome;
        return e.outcome.startsWith("A aguardar") ? "espera" : e.outcome;
      });
      const next = r.status === "waiting" ? ` → aguarda «${label(r.cursor)}» ${new Date(r.scheduled_for).toLocaleString("pt-PT")}` : "";
      const why = r.status === "cancelled" ? ` (${r.result?.cancelled ?? "condições"})` : "";
      console.log(`  ${r.automations.name} [${r.status}${why}] ${log.join(" → ")}${next}`);
    }
  }
  console.log(`\nEnvios: ${JSON.stringify(sends)} (conta de teste: simulados; o webhook vai para o destino de teste)`);
}

/* ---------- Commerce: estados, duplicados, atribuição e reacção das automações ---------- */

/**
 * Na conta de teste já criada, com contactos próprios (ag3-…, novos em cada corrida): cada
 * pagamento entra pelo receptor real (--app), e as verificações lêem as fontes canónicas
 * (real_purchase_events, participant_facts, activity_events, automation_runs).
 */
async function commerce() {
  const org = await testOrganization();
  if (!org) throw new Error("Não há conta de teste. Corra primeiro: node scripts/cenario-teste.mjs criar --dono <email>");
  const [webinar] = await db(`webinars?select=id,cta_url&organization_id=eq.${org.id}&order=created_at&limit=1`);
  const [sales] = await db(`integrations?select=endpoint_key&organization_id=eq.${org.id}&provider=eq.webhook`);
  if (!webinar || !sales) throw new Error("A conta de teste não tem webinar ou receptor de vendas.");
  const product = webinar.cta_url.split("/").pop();
  const run = Date.now().toString(36);
  const email = (who) => `ag3-${who}-${run}@teste.novawebinar.test`;

  // A reacção ao reembolso precisa de uma automação activa com esse gatilho (a do workflow está desligada).
  const [refundAutomation] = await db(
    `automations?select=id&organization_id=eq.${org.id}&trigger_event=eq.purchase_refunded&active=eq.true&limit=1`,
  );
  if (!refundAutomation) {
    await insert("automations", {
      organization_id: org.id, active: true, name: "Agente 3 · Reembolso (teste)",
      trigger_event: "purchase_refunded", conditions: [], wait_minutes: 0,
    });
  }

  // Presenças: segundos vistos (60 s ou mais = assistiu), em replay para não entrar em sessões.
  const watch = { oferta: 30, assistiu: 600, curto: 30, compra: 600, falha: 600, abandono: 600, pendente: 600, reembolso: 600, semid: 600, corrida: 600 };
  for (const [who, seconds] of Object.entries(watch)) {
    const participant = await insert("participants", {
      webinar_id: webinar.id, organization_id: org.id, name: `Agente 3 ${who}`, email: email(who),
      viewing_mode: "replay", joined_at: new Date(Date.now() - 3600_000).toISOString(),
    });
    await rpc("record_participant_progress", { _participant_id: participant.id, _position: seconds, _entry: 0, _played: seconds });
  }

  const post = (body) =>
    fetch(`${APP}/api/public/hooks/${sales.endpoint_key}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).then((r) => r.status);
  const pay = (who, status, extra = {}) =>
    post({ id: `ag3-${who}-${run}`, status, email: email(who), name: `Agente 3 ${who}`, product: "Programa (teste)", amount: 25000, currency: "AOA", ...extra });

  await pay("oferta", "approved", { product_id: product });
  await pay("assistiu", "approved");
  await pay("curto", "approved");
  await pay("novo", "approved");
  await pay("compra", "approved");
  await pay("compra", "approved"); // repetido
  await pay("falha", "failed");
  await pay("abandono", "abandoned");
  await pay("pendente", "pending");
  const pendingFacts = await factsOf(email("pendente"));
  await pay("pendente", "approved");
  await pay("reembolso", "approved");
  await pay("reembolso", "refunded");
  await pay("reembolso", "approved"); // chega atrasado: não desfaz o reembolso
  const noId = { status: "approved", email: email("semid"), name: "Agente 3 semid", amount: 100 };
  await post(noId);
  await post(noId);
  await Promise.all([pay("corrida", "approved"), pay("corrida", "approved"), pay("corrida", "approved")]);

  async function factsOf(address) {
    const rows = await db(`participant_facts?select=checkout_started,purchased,payment_failed,checkout_abandoned,refunded&organization_id=eq.${org.id}&email=eq.${encodeURIComponent(address)}`);
    return rows[0] ?? {};
  }
  const purchases = async (who) =>
    db(`real_purchase_events?select=id,status,webinar_id,contact_id&organization_id=eq.${org.id}&buyer_email=eq.${encodeURIComponent(email(who))}`);
  const events = async (purchaseIds) =>
    purchaseIds.length
      ? db(`activity_events?select=name&organization_id=eq.${org.id}&dedupe_key=in.(${purchaseIds.flatMap((id) => ["checkout_started", "purchase_approved", "payment_failed", "checkout_abandoned", "purchase_refunded"].map((n) => `${n}:${id}`)).join(",")})`)
      : [];

  const checks = [];
  const check = (what, ok, detail = "") => checks.push({ verificação: what, resultado: ok ? "OK" : "FALHOU", detalhe: detail });

  const one = async (who) => (await purchases(who))[0] ?? {};
  check("Atribuição 1: oferta com o produto → webinar da oferta", (await one("oferta")).webinar_id === webinar.id);
  check("Atribuição 2: assistiu ≥ 60 s em 30 dias → esse webinar", (await one("assistiu")).webinar_id === webinar.id);
  check("Atribuição 3: viu < 60 s e sem oferta → sem webinar", (await one("curto")).webinar_id === null);
  check("Atribuição 3: nunca participou → sem webinar", (await one("novo")).webinar_id === null);

  const bought = await purchases("compra");
  check("Compra aprovada: 1 venda, purchased", bought.length === 1 && bought[0].status === "approved" && (await factsOf(email("compra"))).purchased === true);
  const fail = await factsOf(email("falha"));
  check("Falhado ≠ compra", fail.payment_failed === true && fail.purchased === false && fail.checkout_started === true);
  const abandoned = await factsOf(email("abandono"));
  check("Abandonado ≠ compra", abandoned.checkout_abandoned === true && abandoned.purchased === false);
  check("Pendente ≠ compra", pendingFacts.checkout_started === true && pendingFacts.purchased === false);
  check("Pendente → aprovado: a mesma venda passa a compra", (await purchases("pendente")).length === 1 && (await factsOf(email("pendente"))).purchased === true);
  const refunded = await purchases("reembolso");
  const refundFacts = await factsOf(email("reembolso"));
  check("Reembolso ≠ compra activa (e não recua)", refunded.length === 1 && refunded[0].status === "refunded" && refundFacts.purchased === false && refundFacts.refunded === true);
  check("Webhook repetido: uma venda", bought.length === 1);
  check("Sem id, pedido repetido: uma venda", (await purchases("semid")).length === 1);
  check("3 envios em simultâneo: uma venda", (await purchases("corrida")).length === 1);

  const ids = (await Promise.all(["compra", "falha", "abandono", "pendente", "reembolso"].map(purchases))).flat().map((p) => p.id);
  const names = (await events(ids)).map((e) => e.name);
  const count = (n) => names.filter((x) => x === n).length;
  check("Eventos canónicos sem duplicados", count("checkout_started") === 5 && count("purchase_approved") === 3 && count("payment_failed") === 1 && count("checkout_abandoned") === 1 && count("purchase_refunded") === 1,
    ["checkout_started", "purchase_approved", "payment_failed", "checkout_abandoned", "purchase_refunded"].map((n) => `${n}=${count(n)}`).join(" "));

  const contacts = [...new Set((await Promise.all(["compra", "falha", "abandono", "reembolso"].map(purchases))).flat().map((p) => p.contact_id))];
  await waitFor("execuções das automações de pagamento", async () => {
    const runs = await db(`automation_runs?select=status,contact_id&contact_id=in.(${contacts.join(",")})`);
    return runs.length >= 4 && runs.every((r) => FINAL.includes(r.status));
  }, 3 * 60_000).catch(() => {});
  const runs = await db(`automation_runs?select=status,contact_id,automations(trigger_event)&contact_id=in.(${contacts.join(",")})`);
  const reacted = (trigger) => runs.filter((r) => r.automations?.trigger_event === trigger);
  for (const trigger of ["purchase_approved", "payment_failed", "checkout_abandoned", "purchase_refunded"]) {
    const list = reacted(trigger);
    check(`Automação reage a ${trigger}`, list.length > 0, list.map((r) => r.status).join(", "));
  }
  console.table(checks);
  if (checks.some((c) => c.resultado !== "OK")) process.exitCode = 1;
}

const commands = { criar: create, estado: status, limpar: clean, workflow: prepareWorkflow, fluxo: flow, comercio: commerce };
if (!commands[command]) {
  console.log("Uso: node scripts/cenario-teste.mjs criar --dono <email> [--app URL] | estado | limpar | workflow | fluxo [--app URL] | comercio [--app URL]");
  process.exit(1);
}
commands[command]().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
