/**
 * Inteligência dos contactos: em que ponto da jornada está cada pessoa, o que
 * isso significa e o que fazer a seguir. Tudo por regras simples e explicáveis
 * — o dono do webinar tem de perceber porquê, sem estatística.
 */
import type { Database } from "@/integrations/supabase/types";
import type { ParticipantFact } from "@/lib/participant-facts";

export type ContactSummary = Database["public"]["Views"]["contact_summaries"]["Row"];

/** A mesma ordem e os mesmos ids que a coluna `stage` da vista contact_summaries. */
export const STAGES = [
  { id: "new", label: "Sem eventos", hint: "Ainda sem inscrições nem pagamentos" },
  { id: "no_show", label: "Não apareceram", hint: "Inscreveram-se e não assistiram" },
  { id: "watched", label: "Assistiram", hint: "Não viram a oferta" },
  { id: "reached_offer", label: "Viram a oferta", hint: "Não clicaram" },
  { id: "clicked", label: "Clicaram", hint: "Não iniciaram o pagamento" },
  { id: "checkout", label: "Iniciaram o pagamento", hint: "Pendente, falhado ou abandonado" },
  { id: "customer", label: "Compraram", hint: "Clientes" },
] as const;

export type Stage = (typeof STAGES)[number]["id"];
export type Temperature = "customer" | "hot" | "warm" | "cold";

export const TEMPERATURE_LABEL: Record<Temperature, string> = {
  customer: "Cliente",
  hot: "Quente",
  warm: "Morno",
  cold: "Frio",
};

export function stageLabel(stage: string | null | undefined) {
  return STAGES.find((s) => s.id === stage)?.label ?? "Sem eventos";
}

export type NextAction = {
  label: string;
  channel: "whatsapp" | "email" | null;
  /** Mensagem pronta a enviar; o dono pode editar antes. */
  message: string;
};

export type ContactInsight = {
  stage: Stage;
  temperature: Temperature;
  reason: string;
  nextAction: NextAction;
};

const DAY = 86_400_000;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function firstName(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/)[0] ?? "";
}

/**
 * Esteve na sala: tempo medido acima do mínimo, ou viu ou clicou na oferta (quem clica esteve lá, mesmo
 * sem tempo medido, como nos dados importados de outra plataforma).
 */
export function contactPresent(c: Pick<ContactSummary, "events_attended" | "clicked_offer" | "reached_offer">) {
  return (c.events_attended ?? 0) > 0 || Boolean(c.clicked_offer) || Boolean(c.reached_offer);
}

export function contactInsight(c: ContactSummary, now = Date.now()): ContactInsight {
  const stage = (STAGES.some((s) => s.id === c.stage) ? c.stage : "new") as Stage;
  const registered = c.events_registered ?? 0;
  const attended = c.events_attended ?? 0;
  const present = contactPresent(c);
  const purchases = c.purchases ?? 0;
  const idleDays = c.last_seen_at ? Math.floor((now - Date.parse(c.last_seen_at)) / DAY) : 0;
  const hi = firstName(c.name) ? `Olá ${firstName(c.name)}` : "Olá";

  const parts: string[] = [];
  if (registered === 0) parts.push(c.source === "import" ? "Importado, ainda sem eventos" : "Ainda sem eventos");
  else if (!present) parts.push(`Inscreveu-se em ${plural(registered, "evento", "eventos")} e não apareceu`);
  else if (attended === 0) parts.push(`Inscreveu-se em ${plural(registered, "evento", "eventos")} e esteve na sala`);
  else parts.push(`Assistiu a ${attended} de ${plural(registered, "evento", "eventos")}`);
  if (stage === "reached_offer") parts.push("viu a oferta e não clicou");
  if (stage === "clicked") parts.push("clicou na oferta e não iniciou o pagamento");
  if (stage === "checkout")
    parts.push(
      c.payment_failed
        ? "o pagamento falhou"
        : c.checkout_abandoned
          ? "iniciou o pagamento e não concluiu"
          : "tem um pagamento em curso",
    );
  if (stage === "customer") parts.push(`comprou ${purchases === 1 ? "uma vez" : `${purchases} vezes`}`);
  const reason = `${parts.join(", ")}.`;

  let temperature: Temperature;
  let action: Omit<NextAction, "channel">;
  switch (stage) {
    case "customer":
      temperature = "customer";
      action = {
        label: "Agradecer e pedir um testemunho",
        message: `${hi}, obrigado pela confiança! Como está a correr até agora? A sua opinião ajuda muito outras pessoas.`,
      };
      break;
    case "checkout":
      // Tentou pagar: o sinal mais forte antes da compra.
      temperature = idleDays > 21 ? "warm" : "hot";
      action = c.payment_failed
        ? {
            label: "Ajudar a pagar: o pagamento falhou",
            message: `${hi}, vi que o pagamento não passou. Quer que o ajude a concluir? Posso enviar outro link ou outra forma de pagamento.`,
          }
        : c.checkout_abandoned
          ? {
              label: "Recuperar o pagamento que ficou a meio",
              message: `${hi}, vi que começou a inscrição mas não concluiu o pagamento. Ficou alguma dúvida que eu possa esclarecer?`,
            }
          : {
              label: "Acompanhar o pagamento em curso",
              message: `${hi}, vi que está a concluir a inscrição. Se precisar de ajuda com o pagamento, diga-me.`,
            };
      break;
    case "clicked":
      // Clicar é um sinal forte; arrefece se passou tempo sem voltar.
      temperature = idleDays > 21 ? "warm" : "hot";
      action = {
        label: "Falar hoje: clicou e não comprou",
        message: `${hi}, vi que se interessou pela oferta do webinar. Ficou alguma dúvida que eu possa esclarecer?`,
      };
      break;
    case "reached_offer":
      temperature = "warm";
      action = {
        label: "Enviar a oferta com um motivo para decidir",
        message: `${hi}, obrigado por ter ficado até ao fim do webinar. Quer que lhe envie os detalhes da oferta?`,
      };
      break;
    case "watched":
      temperature = attended >= 2 ? "warm" : "cold";
      action =
        attended >= 2
          ? {
              label: `Convidar para o próximo: já voltou ${attended} vezes`,
              message: `${hi}, obrigado por acompanhar os nossos webinars! Tenho um novo em breve e gostava de o ver lá.`,
            }
          : {
              label: "Enviar o replay da parte que perdeu",
              message: `${hi}, a melhor parte do webinar foi depois de sair. Quer que lhe envie o replay?`,
            };
      break;
    case "no_show":
      temperature = "cold";
      action = {
        label: "Enviar o replay: inscreveu-se e não apareceu",
        message: `${hi}, vi que não conseguiu assistir ao webinar. Quer que lhe envie o replay?`,
      };
      break;
    default:
      temperature = "cold";
      action = {
        label: "Convidar para o próximo webinar",
        message: `${hi}, vou fazer um webinar gratuito em breve e acho que lhe vai interessar. Posso enviar-lhe o convite?`,
      };
  }

  const channel = c.phone ? "whatsapp" : c.email ? "email" : null;
  return { stage, temperature, reason, nextAction: { ...action, channel } };
}

/** Ligação wa.me com a mensagem preenchida; só funciona com indicativo do país. */
export function whatsappLink(phone: string | null | undefined, message = "") {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

export function relativeDays(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "—";
  // Dias de calendário (hora local): ontem às 23h é "ontem" mesmo que tenham passado 2 horas.
  const midnight = (t: number) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((midnight(Date.parse(iso)) - midnight(now)) / DAY);
  if (days === 0) return "hoje";
  return new Intl.RelativeTimeFormat("pt-PT", { numeric: "auto" }).format(days, "day");
}

/* ---------- Origem do lead ---------- */

const REFERRER_SOURCES: [RegExp, string][] = [
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "youtube"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "x"],
  [/(^|\.)linkedin\.com$/, "linkedin"],
  [/(^|\.)google\.[a-z.]+$/, "google"],
  [/(^|\.)kambafy\.com$/, "kambafy"],
];

export const SOURCE_LABEL: Record<string, string> = {
  direto: "Direto / sem origem",
  import: "Importação",
  integration: "Chegou por uma compra",
  manual: "Adicionado à mão",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
};

export function sourceLabel(source: string | null | undefined) {
  if (!source) return "Direto / sem origem";
  return SOURCE_LABEL[source] ?? source.charAt(0).toUpperCase() + source.slice(1);
}

/** Mínimo de contactos numa origem para a comparar com as outras. */
export const MIN_SOURCE_SAMPLE = 10;

/**
 * A frase que resume as origens. Só compara origens com amostra suficiente,
 * para não tirar conclusões de duas ou três pessoas.
 */
export function sourceVerdict(
  rows: { source: string; contacts: number; customers: number; clicked: number }[],
): string {
  const total = rows.reduce((s, r) => s + r.contacts, 0);
  const comparable = rows.filter((r) => r.contacts >= MIN_SOURCE_SAMPLE && r.source !== "direto");
  if (comparable.length < 2) {
    return `Ainda é cedo para comparar origens: precisa de pelo menos ${MIN_SOURCE_SAMPLE} contactos em duas origens. Use links com utm_source nos anúncios e publicações.`;
  }
  const rate = (r: { contacts: number; customers: number; clicked: number }) =>
    (r.customers > 0 ? r.customers : r.clicked) / r.contacts;
  const useSales = comparable.some((r) => r.customers > 0);
  const best = comparable.reduce((a, b) => (rate(b) > rate(a) ? b : a));
  const overall =
    rows.reduce((s, r) => s + (useSales ? r.customers : r.clicked), 0) / Math.max(1, total);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  return `${sourceLabel(best.source)} é a origem que mais converte: ${pct(rate(best))} ${
    useSales ? "compram" : "clicam na oferta"
  }, contra ${pct(overall)} no total.`;
}

/**
 * De onde veio quem se inscreve: UTM primeiro; sem UTM, os ids de clique dos
 * anúncios (fbclid, gclid); por fim, o site de onde chegou.
 */
export function leadSource(input: {
  utm_source?: string | undefined;
  utm_medium?: string | undefined;
  utm_campaign?: string | undefined;
  utm_content?: string | undefined;
  fbclid?: string | undefined;
  gclid?: string | undefined;
  referrer: string;
  ownHost: string;
}) {
  const lower = (v?: string) => v?.trim().toLowerCase().slice(0, 120) || undefined;
  const keep = (v?: string) => v?.trim().slice(0, 120) || undefined;
  let utmSource = lower(input.utm_source);
  let utmMedium = lower(input.utm_medium);
  if (!utmSource && input.gclid) [utmSource, utmMedium] = ["google", utmMedium ?? "cpc"];
  if (!utmSource && input.fbclid) utmSource = "facebook";

  let referrer: string | undefined;
  try {
    const host = new URL(input.referrer).hostname.replace(/^www\./, "");
    if (host && host !== input.ownHost.replace(/^www\./, "")) {
      referrer = host.slice(0, 200);
      utmSource ??= REFERRER_SOURCES.find(([re]) => re.test(host))?.[1] ?? host;
    }
  } catch {
    // sem página de origem (link direto, app, email)
  }
  return {
    utmSource,
    utmMedium,
    utmCampaign: keep(input.utm_campaign),
    utmContent: keep(input.utm_content),
    referrer,
  };
}

/* ---------- Jornada: cada evento em que a pessoa entrou, e as compras ---------- */

/** As colunas dos factos que a jornada lê; os três leitores do contacto usam estas. */
export const PARTICIPATION_COLUMNS =
  "participant_id, webinar_id, webinar_title, joined_at, viewing_mode, device, city, country, duration_seconds, offer_start_seconds, entry_seconds, peak_seconds, actual_watch_seconds, watch_measured, watch_ratio, attended, saw_offer, clicked, checkout_started, purchased, payment_failed, checkout_abandoned, refunded, webinar_session_id";

export type Participation = Pick<
  ParticipantFact,
  | "participant_id"
  | "webinar_id"
  | "webinar_title"
  | "joined_at"
  | "viewing_mode"
  | "duration_seconds"
  | "offer_start_seconds"
  | "entry_seconds"
  | "peak_seconds"
  | "actual_watch_seconds"
  | "watch_measured"
  | "watch_ratio"
  | "attended"
  | "saw_offer"
  | "clicked"
  | "checkout_started"
  | "purchased"
  | "payment_failed"
  | "checkout_abandoned"
  | "refunded"
>;

export type Purchase = {
  id: string;
  created_at: string;
  /** Quando o estado actual começou (aprovada, falhada…). */
  status_at: string;
  product_name: string;
  amount: string;
  amount_value: number | null;
  currency: string | null;
  status: string;
  provider: string;
};

export type JourneyStep =
  | {
      kind: "event";
      at: string;
      id: string;
      title: string;
      mode: string;
      attended: boolean;
      /** Tempo efectivamente visto; nas participações antigas, estimado pelo intervalo. */
      watchedSeconds: number;
      watchMeasured: boolean;
      /** Posição em que começou a ver e a mais avançada a que chegou. */
      entrySeconds: number;
      peakSeconds: number;
      durationSeconds: number;
      /** Tempo visto em percentagem do vídeo (0–100), ou null sem duração conhecida. */
      watchedPct: number | null;
      offerAtPct: number | null;
      reachedOffer: boolean;
      clicked: boolean;
      clickedAt: string | null;
      /** Segundo do vídeo do primeiro clique na oferta, quando foi registado. */
      clickedAtSecond: number | null;
      messages: number;
    }
  | { kind: "purchase"; at: string; id: string; title: string; amount: string; status: string };

export function buildJourney(input: {
  participations: Participation[];
  clicks: { participant_id: string | null; occurred_at: string; video_second?: number | null }[];
  messages: { participant_id: string | null }[];
  purchases: Purchase[];
}): JourneyStep[] {
  const steps: JourneyStep[] = input.participations.map((p) => {
    const id = p.participant_id ?? "";
    const duration = p.duration_seconds ?? 0;
    const offerAt = p.offer_start_seconds;
    const click = input.clicks
      .filter((c) => c.participant_id === id)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))[0];
    return {
      kind: "event",
      at: p.joined_at ?? "",
      id,
      title: p.webinar_title ?? "Webinar removido",
      mode: p.viewing_mode ?? "live",
      attended: Boolean(p.attended),
      watchedSeconds: p.actual_watch_seconds ?? 0,
      watchMeasured: Boolean(p.watch_measured),
      entrySeconds: p.entry_seconds ?? 0,
      peakSeconds: p.peak_seconds ?? 0,
      durationSeconds: duration,
      watchedPct: p.watch_ratio === null ? null : Math.round(p.watch_ratio * 100),
      offerAtPct: duration > 0 && offerAt !== null ? Math.min(100, Math.round((offerAt / duration) * 100)) : null,
      reachedOffer: Boolean(p.saw_offer),
      clicked: Boolean(p.clicked) || Boolean(click),
      clickedAt: click?.occurred_at ?? null,
      clickedAtSecond: click?.video_second ?? null,
      messages: input.messages.filter((m) => m.participant_id === id).length,
    };
  });
  for (const buy of input.purchases) {
    steps.push({
      kind: "purchase",
      at: buy.status_at,
      id: buy.id,
      title: buy.product_name || "Compra",
      amount:
        buy.amount_value !== null
          ? new Intl.NumberFormat("pt-PT", {
              style: "currency",
              currency: buy.currency || "EUR",
            }).format(buy.amount_value)
          : buy.amount,
      status: buy.status,
    });
  }
  return steps.sort((a, b) => b.at.localeCompare(a.at));
}

/* ---------- Linha do tempo: o que aconteceu, pela ordem em que aconteceu ---------- */

export type EventLogRow = Pick<
  Database["public"]["Views"]["event_log"]["Row"],
  "name" | "occurred_at" | "webinar_id" | "session_id" | "video_second" | "data"
>;

/** Os nomes da leitura única (event_log), ditos como aconteceram. */
export const TIMELINE_LABEL: Record<string, string> = {
  registered: "Inscreveu-se",
  started_watching: "Começou a ver",
  watch_progress: "Última vez a ver",
  offer_viewed: "Viu a oferta",
  offer_clicked: "Clicou na oferta",
  message_sent: "Escreveu no chat",
  checkout_started: "Iniciou o pagamento",
  purchase_approved: "Compra aprovada",
  payment_failed: "O pagamento falhou",
  checkout_abandoned: "Não concluiu o pagamento",
  purchase_refunded: "Compra reembolsada",
  webinar_session_ended: "A sessão terminou",
  automation_entered: "Entrou na automação",
  automation_executed: "Automação executada",
  automation_failed: "A automação falhou",
  automation_cancelled: "Automação cancelada",
};

export type TimelineItem = {
  name: string;
  label: string;
  at: string;
  webinarId: string | null;
  /** Momento do vídeo (oferta vista ou clicada, onde parou), quando existe. */
  second: number | null;
  /** Repetições seguidas juntas numa linha (ex.: a oferta vista a cada recarga). */
  times: number;
  /** O produto de um pagamento ou o nome da automação. */
  detail: string | null;
};

const PENDING_RUN = new Set(["waiting", "ready", "running"]);

/** O que acompanha o nome: o produto, ou a automação (e se ainda está à espera). */
function timelineDetail(row: EventLogRow) {
  const data = (row.data ?? {}) as { product?: unknown; automation?: unknown; status?: unknown };
  if (typeof data.automation === "string") {
    const waiting = row.name === "automation_entered" && PENDING_RUN.has(String(data.status));
    return waiting ? `${data.automation} — a aguardar` : data.automation;
  }
  return typeof data.product === "string" && data.product ? data.product : null;
}

// Ordem lógica para eventos gravados no mesmo instante (ex.: o pagamento aprovado cria o
// checkout, a compra e a entrada na automação na mesma transacção): a ordem de TIMELINE_LABEL.
const TIMELINE_RANK = Object.keys(TIMELINE_LABEL);

/** As linhas vêm da mais recente para a mais antiga. */
export function timelineItems(rows: EventLogRow[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const rank = (name: string | null) => TIMELINE_RANK.indexOf(name ?? "");
  const ordered = [...rows].sort(
    (a, b) => (b.occurred_at ?? "").localeCompare(a.occurred_at ?? "") || rank(b.name) - rank(a.name),
  );
  for (const row of ordered) {
    if (!row.name || !row.occurred_at) continue;
    const last = items.at(-1);
    const detail = timelineDetail(row);
    if (
      last &&
      last.name === row.name &&
      last.webinarId === row.webinar_id &&
      last.detail === detail &&
      row.name !== "webinar_session_ended"
    ) {
      last.times += 1;
      continue;
    }
    items.push({
      name: row.name,
      label: TIMELINE_LABEL[row.name] ?? row.name,
      at: row.occurred_at,
      webinarId: row.webinar_id,
      times: 1,
      detail,
      second: row.video_second ?? null,
    });
  }
  return items;
}

/* ---------- Importação de folhas (CSV exportado do Excel, Google Sheets, CRM) ---------- */

export type ImportRow = { name: string; email: string; phone: string };

function splitCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const HEADERS = {
  email: ["email", "e-mail", "mail", "correio eletronico", "correio electronico"],
  name: ["nome", "name", "nome completo", "full name", "primeiro nome", "first name"],
  phone: ["telefone", "telemovel", "whatsapp", "celular", "phone", "mobile", "tel", "contacto", "contato"],
};

export function parseContactsCsv(text: string): { rows: ImportRow[]; skipped: number } {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [";", "\t", ","].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
  const table = splitCsv(clean, delimiter);
  const [first] = table;
  if (!first) return { rows: [], skipped: 0 };

  const header = first.map(normalise);
  // Primeiro o nome exacto, depois "contém"; cada coluna só serve um campo
  // ("Nome do contacto" é nome, não telefone).
  const taken = new Set<number>();
  const find = (names: string[]) => {
    let i = header.findIndex((h, idx) => !taken.has(idx) && names.includes(h));
    if (i < 0) i = header.findIndex((h, idx) => !taken.has(idx) && names.some((n) => h.includes(n)));
    if (i >= 0) taken.add(i);
    return i;
  };
  let email = find(HEADERS.email);
  let name = find(HEADERS.name);
  let phone = find(HEADERS.phone);
  const hasHeader = email >= 0 || phone >= 0 || name >= 0;
  const body = hasHeader ? table.slice(1) : table;

  // Sem cabeçalho reconhecido: o conteúdo diz qual coluna é qual.
  if (!hasHeader && body[0]) {
    email = body[0].findIndex((c) => c.includes("@"));
    phone = body[0].findIndex((c, i) => i !== email && /^\+?[\d\s().-]{8,}$/.test(c.trim()));
    name = body[0].findIndex((_, i) => i !== email && i !== phone);
  }

  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const r of body) {
    const row = {
      name: name >= 0 ? (r[name] ?? "").trim() : "",
      email: email >= 0 ? (r[email] ?? "").trim().toLowerCase() : "",
      phone: phone >= 0 ? (r[phone] ?? "").trim() : "",
    };
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email);
    if (!validEmail) row.email = "";
    if (!row.email && row.phone.replace(/\D/g, "").length < 6) skipped++;
    else rows.push(row);
  }
  return { rows, skipped };
}

/* ---------- Apresentação ---------- */

/** "+244000000003" → "+244 000 000 003" (Angola e Portugal); o resto fica como veio. */
export function formatPhone(phone: string | null | undefined) {
  if (!phone) return null;
  return phone.replace(/^\+(244|351)(\d{3})(\d{3})(\d{3})$/, "+$1 $2 $3 $4");
}

export const DEVICE_LABEL: Record<string, string> = {
  mobile: "Telemóvel",
  desktop: "Computador",
  tablet: "Tablet",
};
