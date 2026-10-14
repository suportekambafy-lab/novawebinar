/**
 * Regras da sala sem ecrã: o relógio, a audiência por formato, a oferta e o link do checkout.
 * A sala pública e a pré-visualização do editor usam as mesmas, para mostrarem o mesmo número
 * no mesmo segundo.
 */
import { buildAudienceCurve, curveBounds } from "@/lib/audience-curve";
import { templateById } from "@/lib/prelive-templates";
import { safeZone } from "@/lib/schedule";

/** 65 → «01:05»; a partir de uma hora, «1:01:05». */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const two = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${two(m)}:${two(s % 60)}` : `${two(m)}:${two(s % 60)}`;
}

/* ---------- Audiência ---------- */

/** O formato que o organizador escolhe; a sala lê só o modo e a curva gravada. */
export type AudienceFormat = "fala" | "dynamic" | "cresce" | "mista" | "real" | "off";

export const AUDIENCE_FORMATS: {
  value: AudienceFormat;
  label: string;
  description: string;
  recommended?: boolean;
}[] = [
  {
    value: "fala",
    label: "Acompanha a fala",
    description: "Sobe nos momentos fortes da fala e desce nas explicações longas.",
    recommended: true,
  },
  {
    value: "dynamic",
    label: "Dinâmica",
    description: "Sobe no início, mantém-se e desce no fim, como numa live real.",
  },
  {
    value: "cresce",
    label: "Cresce até à oferta",
    description: "Sobe até ao minuto da oferta e desce devagar depois.",
  },
  {
    value: "mista",
    label: "Real + simulada",
    description: "Soma o número simulado a quem está mesmo a ver.",
  },
  { value: "real", label: "Só a real", description: "Mostra só quem está mesmo na sala." },
  {
    value: "off",
    label: "Não mostrar",
    description: "A sala não mostra quantas pessoas estão a ver.",
  },
];

export type AudienceContext = {
  durationSeconds: number;
  /** Minuto da oferta (ou o sugerido pela análise), em segundos. */
  pitchSeconds: number | null;
  /** Interesse do momento (0 a 100) segundo a análise do vídeo; null sem análise. */
  engagementAt?: ((seconds: number) => number | null) | undefined;
};

/** Pontos gravados por curva: chegam para seguir a fala num vídeo de uma hora. */
export const CURVE_POINTS = 60;

/** O modo que a sala entende para cada formato. */
export function audienceModeFor(format: AudienceFormat): "real" | "simulated" | "hybrid" {
  // «Não mostrar» esconde o número na sala pelo formato; o modo fica o real.
  if (format === "real" || format === "off") return "real";
  return format === "mista" ? "hybrid" : "simulated";
}

const DYNAMIC = buildAudienceCurve(0, 1000, CURVE_POINTS).map((v) => v / 1000);

/** A forma de cada formato entre 0 e 1, antes de se ajustar ao mínimo e ao máximo. */
function rawShape(format: AudienceFormat, t: number, ctx: AudienceContext): number {
  const d = Math.max(1, ctx.durationSeconds);
  const f = Math.min(1, Math.max(0, t / d));
  const dynamic = () => {
    const x = f * (CURVE_POINTS - 1);
    const i = Math.floor(x);
    const a = DYNAMIC[i] ?? 0;
    const b = DYNAMIC[Math.min(CURVE_POINTS - 1, i + 1)] ?? a;
    return a + (b - a) * (x - i);
  };
  if (format === "cresce") {
    const p = Math.min(d, Math.max(1, ctx.pitchSeconds ?? d * 0.9));
    return t <= p ? 0.15 + 0.85 * (t / p) : 1 - (0.3 * (t - p)) / Math.max(1, d - p);
  }
  if (format === "fala") {
    const e = ctx.engagementAt?.(t);
    if (e == null) return dynamic();
    const ramp = Math.min(1, t / 45);
    return Math.min(1, Math.max(0, ramp * (0.45 + ((e - 30) / 45) * 0.55)));
  }
  return dynamic();
}

/**
 * A curva gravada para um formato simulado: o número começa e acaba dentro do intervalo
 * escolhido e toca no mínimo e no máximo, para «De 200 a 600 pessoas» ser o que a sala mostra.
 */
export function buildFormatCurve(
  format: AudienceFormat,
  min: number,
  max: number,
  ctx: AudienceContext,
  points = CURVE_POINTS,
): number[] {
  const lo = Math.max(0, Math.round(min));
  const hi = Math.max(lo, Math.round(max));
  const d = Math.max(1, ctx.durationSeconds);
  const raw = Array.from({ length: points }, (_, i) =>
    rawShape(format, (i / Math.max(1, points - 1)) * d, ctx),
  );
  const rLo = Math.min(...raw);
  const rHi = Math.max(...raw);
  return raw.map((r) => Math.round(lo + (rHi > rLo ? (r - rLo) / (rHi - rLo) : 1) * (hi - lo)));
}

/** O valor da curva gravada num segundo do vídeo (a mesma conta da sala). */
export function curveValueAt(curve: readonly number[], seconds: number, durationSeconds: number) {
  if (curve.length === 0) return 0;
  if (curve.length === 1) return Math.round(curve[0]!);
  const span = durationSeconds > 0 ? durationSeconds : 45 * 60;
  const x = (Math.min(span, Math.max(0, seconds)) / span) * (curve.length - 1);
  const i = Math.floor(x);
  const a = curve[i]!;
  const b = curve[Math.min(curve.length - 1, i + 1)]!;
  return Math.round(a + (b - a) * (x - i));
}

/**
 * O formato de uma curva já gravada: refaz-se cada formato com o mesmo mínimo e máximo e fica o
 * mais parecido. Assim o editor volta a mostrar a escolha sem a guardar à parte.
 */
export function inferAudienceFormat(
  mode: string | null | undefined,
  curve: unknown,
  ctx: AudienceContext,
): AudienceFormat {
  if (mode === "real") return "real";
  if (mode === "hybrid") return "mista";
  const values = Array.isArray(curve) ? curve.map(Number).filter(Number.isFinite) : [];
  const bounds = curveBounds(values);
  if (!bounds || values.length < 2) return "dynamic";
  const d = Math.max(1, ctx.durationSeconds);
  let best: AudienceFormat = "dynamic";
  let bestError = Number.POSITIVE_INFINITY;
  for (const format of ["dynamic", "fala", "cresce"] as const) {
    if (format === "fala" && !ctx.engagementAt) continue;
    const candidate = buildFormatCurve(format, bounds.min, bounds.max, ctx);
    let error = 0;
    for (let i = 0; i < 40; i += 1) {
      const t = (i / 39) * d;
      error += (curveValueAt(values, t, d) - curveValueAt(candidate, t, d)) ** 2;
    }
    if (error < bestError) {
      bestError = error;
      best = format;
    }
  }
  return best;
}

/* ---------- Entrada ---------- */

export const ENTRY_CARD_DEFAULT = "#141414";
export const ENTRY_BUTTON_DEFAULT = "#E8440C";

const HEX = /^#[0-9a-f]{6}$/i;

function luma(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

/**
 * As cores do cartão de entrada a partir de duas: o texto ajusta-se sozinho ao fundo e o texto
 * do botão ao botão. Um código inválido volta à cor de origem.
 */
export function entryPalette(card?: string | null, button?: string | null) {
  const bg = card && HEX.test(card) ? card : ENTRY_CARD_DEFAULT;
  const btn = button && HEX.test(button) ? button : ENTRY_BUTTON_DEFAULT;
  const light = luma(bg) > 160;
  return {
    card: bg,
    button: btn,
    buttonText: luma(btn) > 160 ? "#171717" : "#FFFFFF",
    text: light ? "#171717" : "#FFFFFF",
    muted: light ? "#5C5C5C" : "rgba(255,255,255,.72)",
    field: light ? "#FFFFFF" : "rgba(255,255,255,.07)",
    line: light ? "rgba(0,0,0,.12)" : "rgba(255,255,255,.16)",
    placeholder: light ? "#8F8F8F" : "rgba(255,255,255,.45)",
  };
}

/* ---------- Oferta ---------- */

/** «50 000 Kz» e «6 997 Kz» → 86. Só quando os dois têm números e o segundo é menor. */
export function discountPercent(from: string, price: string): number | null {
  const n = (v: string) => Number(v.replace(/[^\d]/g, ""));
  const a = n(from);
  const b = n(price);
  if (!a || !b || b >= a) return null;
  return Math.round((1 - b / a) * 100);
}

/** Quanto falta no cronómetro da oferta no segundo `t` do vídeo; antes de abrir, o total. */
export function offerCountdownLeft(
  countdownSeconds: number,
  startSeconds: number | null,
  t: number,
) {
  if (countdownSeconds <= 0) return 0;
  const open = startSeconds ?? 0;
  return Math.max(0, Math.min(countdownSeconds, countdownSeconds - (t - open)));
}

/**
 * O cronómetro e o botão da oferta aberta, iguais na sala e na pré-visualização. No zero, com «O botão
 * continua» o cronómetro sai e o botão fica; com «O botão fecha» o botão passa a «Oferta encerrada».
 * O último dia da oferta fecha sempre o botão. `left` é null quando não há cronómetro à vista.
 */
export function offerTimer(
  countdownSeconds: number,
  remaining: number,
  closeAtZero: boolean,
  deadlinePassed = false,
) {
  const zero = countdownSeconds > 0 && remaining <= 0;
  const closed = deadlinePassed || (zero && closeAtZero);
  return { left: countdownSeconds > 0 && !zero && !closed ? Math.round(remaining) : null, closed };
}

/**
 * Uma oferta no tempo do vídeo. A principal vem das colunas `cta_*`; as seguintes ficam em
 * `extra_offers` (por exemplo, uma oferta especial até ao minuto 10 e depois a geral).
 */
export type OfferSlot = {
  id: string;
  /** Segundo do vídeo em que abre. */
  start: number;
  /** Segundo em que fecha; null fica até ao fim. */
  end: number | null;
  product: string;
  priceFrom: string;
  priceNow: string;
  url: string;
  button: string;
  /** Segundos do cronómetro a partir de quando abre; 0 sem cronómetro. */
  countdown: number;
  /** O último dia da oferta (AAAA-MM-DD); depois dele o botão fecha. */
  deadline?: string | null | undefined;
};

/**
 * Como a sala se mostra: «Webinar» (vídeo deitado, chat ao lado) ou «Live» (vídeo com o chat por
 * cima, como no Instagram). Depois do formato, a sala personaliza-se igual nos dois.
 */
export type RoomFormat = "webinar" | "live";

export const ROOM_FORMATS: readonly { id: RoomFormat; name: string; hint: string }[] = [
  { id: "webinar", name: "Webinar", hint: "Vídeo deitado e o chat ao lado" },
  { id: "live", name: "Live", hint: "Vídeo com o chat por cima, como no Instagram" },
];

/**
 * O formato fica nas definições do chat (`chat_settings.room_format`): o que muda é o lugar do chat,
 * ao lado do vídeo ou por cima dele, e assim não precisa de uma coluna nova.
 */
export function roomFormat(chatSettings: unknown): RoomFormat {
  return (chatSettings as { room_format?: unknown } | null)?.room_format === "live"
    ? "live"
    : "webinar";
}

/*
 * ---------- Opções da sala, iguais nos dois formatos (em `chat_settings.live`) ----------
 * O nome `live` ficou de quando só o formato Live as tinha; mudá-lo obrigava a mexer nos dados gravados.
 */

export type FollowNetwork = "instagram" | "youtube" | "tiktok" | "facebook";
/** Um momento do vídeo em que o + Seguir aparece (quando o apresentador pede para seguir). */
export type FollowMoment = { start: number; end: number };
export type LiveSettings = {
  /**
   * A forma gravada antes de a sala a ler do ficheiro. Já não muda nada (a forma vem do vídeo e cada
   * aparelho tem regras fixas); fica para os dados antigos continuarem a ler-se.
   */
  desk: "horizontal" | "vertical";
  /** O botão para começar a ver: só o botão a pulsar, ou o botão com uma linha de informação. */
  entry: EntryLook;
  /** Os perfis que o + Seguir mostra; uma rede sem link não aparece. */
  links: Partial<Record<FollowNetwork, string>>;
  moments: FollowMoment[];
  /** Quem já seguiu (tocou numa rede) deixa de ver o + Seguir; desligado, volta a vê-lo em cada momento. */
  hideFollowed: boolean;
  /** Avisa no chat, só para a pessoa, quando o Suporte respondeu e ela ainda não viu. */
  notify: boolean;
  /** A cor do botão de entrar e, por omissão, da oferta, em código hex. */
  offerColor: string;
  /** O cartão da oferta: quadrado (grande, com a imagem), compacto (uma linha) ou clássico (faixa na cor, fundo meio transparente). */
  offerLook: OfferLook;
  /** As cores próprias da oferta; o que ficar vazio segue a cor do botão (o botão) e o tema da sala (o cartão). */
  offerColors: OfferColors;
  /** A contagem antes de começar; null nos webinars gravados antes dela (valem as colunas prelive_*). */
  countdown: RoomCountdown | null;
  /** Webinar: o título e quem apresenta por cima do chat. Desligado, ficam o vídeo, o chat, o Suporte e a oferta. */
  header: boolean;
  /** Webinar, telemóvel ao alto com vídeo horizontal: o botão de ecrã inteiro (ver deitado), por cima do vídeo. */
  fullscreenButton: boolean;
  /** O temporizador da aula: a percentagem por cima do vídeo, só nos minutos escolhidos. */
  timer: RoomTimer;
  /** A sala de espera: o vídeo de fundo e se a contagem aparece por cima. */
  waiting: WaitingRoom;
};

/**
 * A sala de espera (antes de a sala abrir): um vídeo da Biblioteca ao fundo (o id em `video_sources`;
 * null, nenhum), sem som até a pessoa o ligar, e a contagem por cima se `countdown` estiver ligado.
 */
export type WaitingRoom = { video: string | null; countdown: boolean };
export const WAITING_DEFAULT: WaitingRoom = { video: null, countdown: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseWaiting(raw: unknown): WaitingRoom {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const video = r["video"];
  return {
    video: typeof video === "string" && UUID.test(video) ? video : null,
    countdown: r["countdown"] !== false,
  };
}

/**
 * O temporizador da aula: entre «de» e «a» (segundos do vídeo), a sala mostra quanto da aula já
 * passou, em %, num dos quatro modelos. Sem cor escolhida (null), usa a cor do botão.
 */
export type TimerModel = "bar" | "ring" | "pill" | "clock";
export type RoomTimer = {
  on: boolean;
  start: number;
  end: number;
  model: TimerModel;
  color: string | null;
};
export const TIMER_MODELS: readonly { id: TimerModel; name: string }[] = [
  { id: "bar", name: "Barra" },
  { id: "ring", name: "Anel" },
  { id: "pill", name: "Pílula" },
  { id: "clock", name: "Contador" },
];
export const TIMER_OFF: RoomTimer = { on: false, start: 0, end: 0, model: "bar", color: null };

/** Quanto da aula já passou, de 0 a 100; sem intervalo válido (fim antes do início), 0. */
export function timerProgress(seconds: number, start: number, end: number) {
  if (!(end > start)) return 0;
  return Math.min(100, Math.max(0, ((seconds - start) / (end - start)) * 100));
}

/** A % a mostrar neste segundo, arredondada; null com o temporizador desligado ou fora de «de… a…». */
export function lessonTimerAt(timer: RoomTimer | null | undefined, seconds: number) {
  if (!timer?.on || !(timer.end > timer.start) || seconds < timer.start || seconds > timer.end)
    return null;
  return Math.round(timerProgress(seconds, timer.start, timer.end));
}

function parseTimer(raw: unknown): RoomTimer {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ...TIMER_OFF };
  const r = raw as Record<string, unknown>;
  const start = Math.round(Number(r["start"]));
  const end = Math.round(Number(r["end"]));
  const valid = Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
  return {
    on: r["on"] === true && valid,
    start: valid ? start : 0,
    end: valid ? end : 0,
    model: TIMER_MODELS.some((m) => m.id === r["model"]) ? (r["model"] as TimerModel) : "bar",
    color: typeof r["color"] === "string" && HEX.test(r["color"]) ? r["color"].toUpperCase() : null,
  };
}

export type EntryLook = "pulse" | "info";

export type OfferLook = "square" | "compact" | "classic";
export const OFFER_LOOKS: readonly { id: OfferLook; name: string }[] = [
  { id: "square", name: "Quadrada" },
  { id: "compact", name: "Compacta" },
  { id: "classic", name: "Clássica" },
];
/** O botão da oferta, o fundo e o texto do cartão, em código hex; sem um deles, vale o de omissão. */
export type OfferColors = { button?: string; card?: string; text?: string };

function parseOfferColors(raw: unknown): OfferColors {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const out: OfferColors = {};
  for (const key of ["button", "card", "text"] as const) {
    const v = r[key];
    if (typeof v === "string" && HEX.test(v)) out[key] = v.toUpperCase();
  }
  return out;
}

/**
 * A contagem antes de a sessão começar: a sala abre uns minutos antes, o chat já funciona e o lugar
 * do vídeo mostra o relógio no estilo e na cor escolhidos. Os estilos são os ids dos modelos
 * (`prelive-templates`), para os dados antigos continuarem a ler-se.
 */
export type CountdownStyle = "minimal" | "premium" | "dark" | "urgency";
/** O fundo da contagem: uma imagem (endereço) ou um vídeo da Biblioteca (o id em `video_sources`); sem nenhum, a cor. */
export type CountdownBackground = { image: string | null; video: string | null };
export const COUNTDOWN_BACKGROUND_NONE: CountdownBackground = { image: null, video: null };
/**
 * Duas contagens independentes, com o mesmo aspecto: `on`/`minutes`, a sala abre antes da hora com o relógio
 * a contar até à hora; `afterOn`/`after`, à hora marcada o relógio conta estes minutos e só depois o vídeo
 * começa (quem chega à hora vê-o; quem se atrasa apanha o início).
 */
export type RoomCountdown = {
  on: boolean;
  minutes: number;
  style: CountdownStyle;
  color: string;
  sound: boolean;
  background: CountdownBackground;
  afterOn: boolean;
  after: number;
};

export const COUNTDOWN_STYLES: readonly { id: CountdownStyle; name: string }[] = [
  { id: "minimal", name: "Anel" },
  { id: "premium", name: "Blocos" },
  { id: "dark", name: "Grande" },
  { id: "urgency", name: "Barra" },
];
export const COUNTDOWN_MINUTES = [1, 3, 5, 10, 15] as const;
export const COUNTDOWN_OFF: RoomCountdown = {
  on: false,
  minutes: 5,
  style: "minimal",
  color: "#E8440C",
  sound: true,
  background: COUNTDOWN_BACKGROUND_NONE,
  afterOn: false,
  after: 5,
};

function parseCountdownBackground(raw: unknown): CountdownBackground {
  const r = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const image = r["image"];
  const video = r["video"];
  return {
    image:
      typeof image === "string" && /^https?:\/\//i.test(image) && image.length <= 2000
        ? image
        : null,
    video: typeof video === "string" && UUID.test(video) ? video : null,
  };
}

function parseCountdown(raw: unknown): RoomCountdown | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const minutes = Math.round(Number(r["minutes"]));
  return {
    on: r["on"] === true,
    minutes: Number.isFinite(minutes) ? Math.min(30, Math.max(1, minutes)) : COUNTDOWN_OFF.minutes,
    style: COUNTDOWN_STYLES.some((s) => s.id === r["style"])
      ? (r["style"] as CountdownStyle)
      : COUNTDOWN_OFF.style,
    color: offerColor(r["color"]),
    sound: r["sound"] !== false,
    background: parseCountdownBackground(r["background"]),
    afterOn: r["afterOn"] === true,
    after:
      Number.isFinite(Number(r["after"])) && Number(r["after"]) > 0
        ? Math.min(30, Math.max(1, Math.round(Number(r["after"]))))
        : COUNTDOWN_OFF.after,
  };
}

/** As colunas prelive_* que o editor antigo (antes da versão 13) gravava. */
export type LegacyCountdown = {
  prelive_enabled?: boolean | null;
  prelive_seconds?: number | null;
  prelive_template?: string | null;
  prelive_sound?: boolean | null;
};

/** A contagem de um webinar antigo, lida das colunas prelive_*; desligada, null. */
export function countdownFromLegacy(
  legacy: LegacyCountdown | null | undefined,
): RoomCountdown | null {
  const seconds = legacy?.prelive_seconds ?? 0;
  if (!legacy?.prelive_enabled || seconds <= 0) return null;
  return {
    on: true,
    minutes: Math.min(30, Math.max(1, Math.round(seconds / 60))),
    style: templateById(legacy.prelive_template).id,
    color: OFFER_COLOR_DEFAULT,
    sound: legacy.prelive_sound !== false,
    background: COUNTDOWN_BACKGROUND_NONE,
    afterOn: false,
    after: 5,
  };
}

/**
 * O que a sala usa da contagem: os segundos (0 desliga), o estilo, a cor e o som. Sem a escolha nova
 * (webinars antigos), valem as colunas prelive_*, lidas como o editor as mostra.
 */
export function roomCountdown(
  countdown: RoomCountdown | null | undefined,
  legacy: LegacyCountdown,
) {
  const c = countdown ?? countdownFromLegacy(legacy) ?? COUNTDOWN_OFF;
  return {
    seconds: c.on ? c.minutes * 60 : 0,
    /** Segundos depois da hora em que o relógio ainda corre antes de o vídeo arrancar. */
    afterSeconds: c.afterOn ? c.after * 60 : 0,
    style: c.style as string,
    color: c.color,
    sound: c.sound,
    background: c.background,
  };
}

export const OFFER_COLOR_DEFAULT = "#E8440C";
/** As sugestões ao lado do seletor: laranja da marca, vermelho, verde, azul e roxo. */
export const OFFER_COLOR_SUGGESTIONS = [
  OFFER_COLOR_DEFAULT,
  "#E3141F",
  "#16A34A",
  "#2563EB",
  "#7C3AED",
] as const;
/** As cores gravadas por nome antes de haver o código hex. */
const OFFER_COLOR_NAMES: Record<string, string> = {
  laranja: OFFER_COLOR_DEFAULT,
  vermelho: "#E3141F",
  verde: "#16A34A",
  azul: "#2563EB",
  roxo: "#7C3AED",
};

export const LIVE_DEFAULTS: LiveSettings = {
  desk: "horizontal",
  entry: "info",
  links: {},
  moments: [],
  hideFollowed: true,
  notify: true,
  offerColor: OFFER_COLOR_DEFAULT,
  offerLook: "square",
  offerColors: {},
  countdown: null,
  header: true,
  fullscreenButton: true,
  timer: TIMER_OFF,
  waiting: WAITING_DEFAULT,
};

export const FOLLOW_NETWORKS: readonly {
  id: FollowNetwork;
  name: string;
  example: string;
  android: string;
}[] = [
  {
    id: "instagram",
    name: "Instagram",
    example: "https://www.instagram.com/perfil",
    android: "com.instagram.android",
  },
  {
    id: "youtube",
    name: "YouTube",
    example: "https://www.youtube.com/@canal",
    android: "com.google.android.youtube",
  },
  {
    id: "tiktok",
    name: "TikTok",
    example: "https://www.tiktok.com/@perfil",
    android: "com.zhiliaoapp.musically",
  },
  {
    id: "facebook",
    name: "Facebook",
    example: "https://www.facebook.com/pagina",
    android: "com.facebook.katana",
  },
];

/**
 * Onde fica o vídeo no Live, com regras fixas por aparelho (como no Instagram e no YouTube): o vídeo
 * ao alto enche o telemóvel e, no computador, fica numa coluna ao centro; o deitado fica em cima, à
 * largura do telemóvel, e inteiro no computador. A forma vem do ficheiro; sem ela, conta como deitado.
 */
export type LiveVideoPlace = "fill" | "top" | "wide" | "column";
export function liveVideoPlace(
  shape: "horizontal" | "vertical" | null | undefined,
  where: "desk" | "phone",
): LiveVideoPlace {
  if (shape === "vertical") return where === "phone" ? "fill" : "column";
  return where === "phone" ? "top" : "wide";
}

/**
 * Lê as opções da sala; o que faltar ou vier estragado fica com o valor por omissão. Com `legacy` (o
 * editor), a contagem de um webinar antigo vem das colunas prelive_*: o editor mostra o que a sala faz.
 */
export function liveSettings(chatSettings: unknown, legacy?: LegacyCountdown): LiveSettings {
  const raw = (chatSettings as { live?: unknown } | null)?.live;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return {
      ...LIVE_DEFAULTS,
      links: {},
      moments: [],
      offerColors: {},
      countdown: countdownFromLegacy(legacy),
    };
  const r = raw as Record<string, unknown>;
  const linksRaw =
    typeof r["links"] === "object" && r["links"] !== null
      ? (r["links"] as Record<string, unknown>)
      : {};
  const links: LiveSettings["links"] = {};
  for (const n of FOLLOW_NETWORKS) {
    const url = linksRaw[n.id];
    if (typeof url === "string" && url.trim()) links[n.id] = url.trim();
  }
  const moments = Array.isArray(r["moments"])
    ? (r["moments"] as unknown[])
        .map((m) => m as { start?: unknown; end?: unknown })
        .filter(
          (m) =>
            Number.isFinite(Number(m.start)) &&
            Number.isFinite(Number(m.end)) &&
            Number(m.end) > Number(m.start),
        )
        .map((m) => ({
          start: Math.max(0, Math.round(Number(m.start))),
          end: Math.round(Number(m.end)),
        }))
        .sort((a, b) => a.start - b.start)
    : [];
  return {
    desk: r["desk"] === "vertical" ? "vertical" : "horizontal",
    entry: r["entry"] === "pulse" ? "pulse" : "info",
    links,
    moments,
    hideFollowed: r["hideFollowed"] !== false,
    notify: r["notify"] !== false,
    offerColor: offerColor(r["offerColor"]),
    offerLook: OFFER_LOOKS.some((l) => l.id === r["offerLook"])
      ? (r["offerLook"] as OfferLook)
      : "square",
    offerColors: parseOfferColors(r["offerColors"]),
    countdown: parseCountdown(r["countdown"]) ?? countdownFromLegacy(legacy),
    header: r["header"] !== false,
    fullscreenButton: r["fullscreenButton"] !== false,
    timer: parseTimer(r["timer"]),
    waiting: parseWaiting(r["waiting"]),
  };
}

/** A cor da oferta: um código hex válido, uma cor gravada por nome, ou o laranja da marca. */
export function offerColor(value: unknown) {
  if (typeof value !== "string") return OFFER_COLOR_DEFAULT;
  if (HEX.test(value)) return value.toUpperCase();
  return OFFER_COLOR_NAMES[value] ?? OFFER_COLOR_DEFAULT;
}

/**
 * As variáveis CSS das cores da oferta, para pôr no elemento do cartão: o botão (--of*), o fundo e o
 * texto (os tokens da sala, só ali dentro; o texto ajusta-se ao fundo se não for escolhido). Sem
 * nenhuma cor, null: o cartão segue a cor do botão de entrar e o tema da sala.
 */
export function offerColorVars(
  colors: OfferColors | null | undefined,
): Record<string, string> | null {
  const { button, card, text } = colors ?? {};
  if (!button && !card && !text) return null;
  const vars: Record<string, string> = {};
  if (button) {
    vars["--of"] = button;
    vars["--of-mid"] = `color-mix(in srgb, ${button} 52%, #000)`;
    vars["--of-dark"] = `color-mix(in srgb, ${button} 20%, #000)`;
    vars["--of-on"] = entryPalette(null, button).buttonText;
  }
  const ink = text ?? (card ? entryPalette(card).text : null);
  if (card && ink) {
    vars["--room-surface"] = card;
    vars["--room-raised"] = `color-mix(in srgb, ${card} 90%, ${ink})`;
    vars["--room-line"] = `color-mix(in srgb, ${card} 80%, ${ink})`;
  }
  if (ink) {
    vars["--room-ink"] = ink;
    vars["--room-ink-2"] = `color-mix(in srgb, ${ink} 62%, transparent)`;
  }
  // O tempo e o «Inscrições abertas»: a cor do botão, puxada para o texto, para se ler no fundo.
  vars["--of-ink"] = `color-mix(in srgb, var(--of) 78%, ${ink ?? "var(--room-ink)"})`;
  return vars;
}

/** O + Seguir aparece só dentro de um dos momentos escolhidos. */
export function followMomentAt(moments: readonly FollowMoment[], seconds: number) {
  return moments.some((m) => seconds >= m.start && seconds < m.end);
}

/** O @ do perfil, tirado do link (instagram.com/perfil/ → @perfil). */
export function profileHandle(url: string) {
  const last =
    url
      .replace(/[?#].*$/, "")
      .split("/")
      .filter(Boolean)
      .pop() ?? "";
  return last ? `@${last.replace(/^@/, "")}` : "";
}

/** O link que a pessoa abre: no YouTube já vem com o pedido para subscrever. */
export function followWebLink(network: FollowNetwork, url: string) {
  const clean = url.trim();
  if (network !== "youtube" || /sub_confirmation=/.test(clean)) return clean;
  return `${clean}${clean.includes("?") ? "&" : "?"}sub_confirmation=1`;
}

/**
 * No Android, um link «intent» abre a app da rede directamente no perfil e, sem a app, o site.
 * No iPhone o próprio link https abre a app (link universal), por isso fica igual.
 */
export function followAppLink(
  network: FollowNetwork,
  web: string,
  platform: "android" | "ios" | "other",
) {
  if (platform !== "android") return web;
  let u: URL;
  try {
    u = new URL(web);
  } catch {
    return web;
  }
  const pkg = FOLLOW_NETWORKS.find((n) => n.id === network)?.android ?? "";
  const path =
    network === "instagram"
      ? `${u.host}/_u/${u.pathname.replace(/^\/+/, "")}`
      : `${u.host}${u.pathname}${u.search}`;
  return `intent://${path}#Intent;scheme=https;package=${pkg};S.browser_fallback_url=${encodeURIComponent(web)};end`;
}

/**
 * Os minutos em que o apresentador pede para seguir ou subscrever, tirados da transcrição:
 * cada frase com «sigam», «segue», «inscrevam-se»… abre um momento de 30 s. Momentos colados juntam-se.
 */
export function suggestFollowMoments(
  lines: readonly { at: number; text: string }[],
  length = 30,
): FollowMoment[] {
  const asks = /\b(sigam|siga|segue[mn]?|me segue|inscrev\w*|subscrev\w*|ativ[ae]m? o sininho)\b/i;
  const out: FollowMoment[] = [];
  for (const line of lines) {
    if (!asks.test(line.text)) continue;
    const start = Math.max(0, Math.round(line.at));
    const last = out[out.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, start + length);
    else out.push({ start, end: start + length });
  }
  return out.slice(0, 6);
}

/** Um link de grupo (WhatsApp ou Telegram): o botão pede os dados antes de abrir o grupo. */
export function isGroupLink(url: string | null | undefined) {
  return /^https?:\/\/(chat\.whatsapp\.com|t\.me|telegram\.me)\//i.test((url ?? "").trim());
}

/** As ofertas seguintes gravadas; o que não tiver minuto nem link fica de fora. */
export function parseExtraOffers(raw: unknown): OfferSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: OfferSlot[] = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const start = Number(r["start"]);
    if (!Number.isFinite(start) || start < 0) continue;
    const end = r["end"] == null || r["end"] === "" ? null : Number(r["end"]);
    out.push({
      id: String(r["id"] ?? `extra-${i}`).slice(0, 40),
      start: Math.round(start),
      end: end !== null && Number.isFinite(end) && end > start ? Math.round(end) : null,
      product: String(r["product"] ?? "").slice(0, 120),
      priceFrom: String(r["priceFrom"] ?? "").slice(0, 40),
      priceNow: String(r["priceNow"] ?? "").slice(0, 40),
      url: String(r["url"] ?? "").slice(0, 500),
      button: String(r["button"] ?? "").slice(0, 60) || "Quero entrar",
      countdown: Math.max(0, Math.round(Number(r["countdown"]) || 0)),
      deadline:
        typeof r["deadline"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r["deadline"])
          ? r["deadline"]
          : null,
    });
  }
  return out.sort((a, b) => a.start - b.start).slice(0, 4);
}

/**
 * A oferta aberta no segundo `t`: a última que já abriu e ainda não fechou. Uma oferta que
 * abre fecha a anterior, mesmo que esta não tenha fim marcado.
 */
export function activeOffer(offers: readonly OfferSlot[], t: number): OfferSlot | null {
  const sorted = [...offers].sort((a, b) => a.start - b.start);
  let current: OfferSlot | null = null;
  for (const offer of sorted) {
    if (offer.start > t) break;
    current = offer.end === null || t < offer.end ? offer : null;
  }
  return current;
}

/** O prazo da oferta terminou: depois do fim desse dia, no fuso do webinar. */
export function offerDeadlinePassed(
  deadline: string | null | undefined,
  timezone: string,
  nowMs: number,
) {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return false;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: safeZone(timezone) }).format(
    new Date(nowMs),
  );
  return today > deadline;
}

/**
 * O aviso de compra no ecrã no segundo `t`: entra no seu momento e fica até ao fim do seu tempo
 * (`showing` é o que já está à vista). Um aviso que já saiu não volta, mesmo que se recue no vídeo.
 */
export function purchaseOnScreen<T extends { purchase: { id: string }; from: number; to: number }>(
  schedule: readonly T[],
  t: number,
  shown: ReadonlySet<string>,
  showing: string | null,
): T | null {
  return (
    schedule.find(
      (s) => (s.purchase.id === showing || !shown.has(s.purchase.id)) && t >= s.from && t < s.to,
    ) ?? null
  );
}

/** Onde a pessoa clicou para ir ao checkout. */
export type OfferPlace = "sala" | "chat" | "email" | "whatsapp";

/**
 * O link do botão da oferta com a origem da pessoa: o anúncio de onde veio (ou novawebinar),
 * onde clicou e em que minuto, e quem é. Um link que não é http(s) volta como estava.
 */
export function checkoutLink(
  url: string,
  origin: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    place: OfferPlace;
    seconds: number;
    participant?: string | null;
  },
): string {
  let link: URL;
  try {
    link = new URL(url);
  } catch {
    return url;
  }
  if (link.protocol !== "https:" && link.protocol !== "http:") return url;
  const m = Math.floor(Math.max(0, origin.seconds) / 60);
  const s = Math.floor(Math.max(0, origin.seconds) % 60);
  const set = (key: string, value: string | null | undefined) => {
    if (value && !link.searchParams.has(key)) link.searchParams.set(key, value);
  };
  set("utm_source", origin.source || "novawebinar");
  set("utm_medium", origin.medium || "webinar");
  set("utm_campaign", origin.campaign);
  set(
    "utm_content",
    `${origin.place}-${String(m).padStart(2, "0")}m${String(s).padStart(2, "0")}s`,
  );
  set("cw", origin.participant);
  return link.toString();
}
