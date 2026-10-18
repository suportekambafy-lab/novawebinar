/**
 * Cálculo do horário real de cada sessão.
 *
 * Um webinar pode arrancar de três maneiras:
 *  - data única: começa na data e hora marcadas;
 *  - just in time: recomeça de X em X minutos, para quem chega a qualquer hora;
 *  - repetição automática: uma vez por dia ou por semana, à hora definida.
 *
 * Tudo é calculado no fuso horário escolhido pelo organizador.
 */

export type ScheduleInput = {
  schedule_mode?: string | null;
  scheduled_at?: string | null;
  /** Hora de fim (HH:MM) para sessões de data única; vazio = fim pela duração do vídeo. */
  session_end_time?: string | null;
  recurrence_enabled?: boolean | null;
  recurrence_pattern?: string | null;
  recurrence_weekday?: number | null;
  recurrence_start_time?: string | null;
  recurrence_end_time?: string | null;
  jit_interval_minutes?: number | null;
  /** Just in time sem sessões entre as 22:00 e as 07:00 (no fuso do webinar). */
  jit_skip_night?: boolean | null;
  /** Repetição em vários dias (0 = domingo … 6 = sábado); vazio segue `recurrence_pattern`. */
  recurrence_days?: readonly number[] | null;
  /** Repetição a várias horas («20:00»); vazio usa `recurrence_start_time`. */
  recurrence_times?: readonly string[] | null;
  timezone?: string | null;
  duration_seconds?: number | null;
  /**
   * Contagem depois de começar (segundos): o vídeo só arranca este tempo depois da hora, por isso a
   * sessão acaba outro tanto mais tarde. Ver `startDelaySeconds` em room-logic.
   */
  start_delay_seconds?: number | null;
};

export type SessionWindow = {
  /** Início da sessão em curso ou da próxima, em milissegundos. */
  startMs: number | null;
  /** Fim previsto da sessão, em milissegundos. */
  endMs: number | null;
  /** Verdadeiro quando a sessão já arrancou. */
  live: boolean;
  /** Fim da última sessão já terminada, em milissegundos (repetição automática). */
  endedMs: number | null;
  /** Verdadeiro quando a sala de espera deve abrir: no dia da próxima sessão. */
  waitingOpen: boolean;
};

export function parseTime(value?: string | null): { hour: number; minute: number } | null {
  if (!value) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour > 23 || minute > 59) return null;
  return { hour, minute };
}

/** O fuso do webinar quando é válido; senão UTC (um fuso inválido faria o Intl lançar erro). */
export function safeZone(timezone?: string | null) {
  if (!timezone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return timezone;
  } catch {
    return "UTC";
  }
}

export function zoneParts(ms: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
  }).formatToParts(new Date(ms));
  const read = (type: string) => parts.find((p) => p.type === type)?.value ?? "0";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(read("year")),
    month: Number(read("month")),
    day: Number(read("day")),
    hour: Number(read("hour")) % 24,
    minute: Number(read("minute")),
    second: Number(read("second")),
    weekday: Math.max(0, weekdays.indexOf(parts.find((p) => p.type === "weekday")?.value ?? "Sun")),
  };
}

function zoneOffset(ms: number, timezone: string) {
  const p = zoneParts(ms, timezone);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
  );
}

/** Converte uma hora local (no fuso indicado) para o instante real em milissegundos. */
export function zonedTimeToMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ms = guess - zoneOffset(guess, timezone);
  ms = guess - zoneOffset(ms, timezone);
  return ms;
}

/** Devolve a janela da sessão em curso, ou da próxima, para o momento indicado. */
export function sessionWindow(webinar: ScheduleInput, nowMs = Date.now()): SessionWindow {
  const timezone = safeZone(webinar.timezone);
  const video = Math.max(0, webinar.duration_seconds ?? 0) * 1000;
  const delay = Math.max(0, webinar.start_delay_seconds ?? 0) * 1000;
  // A sessão dura o vídeo mais a contagem depois de começar, que atrasa o arranque do vídeo.
  const duration = video ? video + delay : 0;
  // Com essa contagem, uma hora de fim marcada nunca corta o fim do vídeo.
  const fitVideo = (startMs: number, endMs: number) =>
    delay && duration ? Math.max(endMs, startMs + duration) : endMs;

  // Just in time: arranca de X em X minutos.
  if (webinar.schedule_mode === "jit") {
    const interval = Math.max(5, webinar.jit_interval_minutes ?? 15) * 60 * 1000;
    const slot = Math.floor(nowMs / interval) * interval;
    // Quem chega nos primeiros dois minutos apanha a sessão que acabou de arrancar.
    let startMs = nowMs - slot <= 2 * 60 * 1000 ? slot : slot + interval;
    // Sem noites: entre as 22:00 e as 07:00 a sessão seguinte é às 07:00.
    if (webinar.jit_skip_night) {
      const p = zoneParts(startMs, timezone);
      if (p.hour >= 22 || p.hour < 7) {
        const morning = new Date(Date.UTC(p.year, p.month - 1, p.day + (p.hour >= 22 ? 1 : 0)));
        startMs = zonedTimeToMs(
          morning.getUTCFullYear(),
          morning.getUTCMonth() + 1,
          morning.getUTCDate(),
          7,
          0,
          timezone,
        );
      }
    }
    return {
      startMs,
      endMs: duration ? startMs + duration : null,
      live: startMs <= nowMs,
      endedMs: null,
      waitingOpen: true,
    };
  }

  // Repetição automática: nos dias escolhidos (ou diária / semanal), a cada hora definida.
  const times = (
    webinar.recurrence_times?.length ? webinar.recurrence_times : [webinar.recurrence_start_time]
  )
    .map((value) => parseTime(value))
    .filter((value): value is { hour: number; minute: number } => value !== null)
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
  if (webinar.recurrence_enabled && times.length > 0) {
    // A hora de fim só vale com uma única hora; com várias, cada sessão dura o vídeo.
    const end = times.length === 1 ? parseTime(webinar.recurrence_end_time) : null;
    const days = webinar.recurrence_days?.length ? new Set(webinar.recurrence_days) : null;
    const weekly = webinar.recurrence_pattern === "weekly";
    const targetWeekday = Math.min(6, Math.max(0, webinar.recurrence_weekday ?? 1));
    const today = zoneParts(nowMs, timezone);
    let lastEndedMs: number | null = null;

    for (let step = -1; step <= 14; step += 1) {
      const base = new Date(Date.UTC(today.year, today.month - 1, today.day + step));
      const weekday = base.getUTCDay();
      if (days ? !days.has(weekday) : weekly && weekday !== targetWeekday) continue;
      for (const start of times) {
        const startMs = zonedTimeToMs(
          base.getUTCFullYear(),
          base.getUTCMonth() + 1,
          base.getUTCDate(),
          start.hour,
          start.minute,
          timezone,
        );
        const endMs = end
          ? fitVideo(
              startMs,
              zonedTimeToMs(
                base.getUTCFullYear(),
                base.getUTCMonth() + 1,
                base.getUTCDate() +
                  (end.hour * 60 + end.minute <= start.hour * 60 + start.minute ? 1 : 0),
                end.hour,
                end.minute,
                timezone,
              ),
            )
          : duration
            ? startMs + duration
            : null;
        // Sessão a decorrer agora. Sem hora de fim nem duração conhecida,
        // assumimos uma sessão de duas horas para a sala de espera voltar a abrir.
        const fallbackEnd = startMs + 2 * 60 * 60 * 1000;
        const effectiveEnd = endMs ?? fallbackEnd;
        if (startMs <= nowMs && nowMs < effectiveEnd)
          return { startMs, endMs, live: true, endedMs: null, waitingOpen: false };
        // Sessão já terminada: guardamos o fim para mostrar "Transmissão terminou"
        // até ao dia da sessão seguinte.
        if (effectiveEnd <= nowMs) {
          lastEndedMs = effectiveEnd;
          continue;
        }
        // Próxima sessão: a sala de espera só abre no próprio dia da sessão.
        const nextDay = zoneParts(startMs, timezone);
        const sameDay =
          nextDay.year === today.year && nextDay.month === today.month && nextDay.day === today.day;
        return { startMs, endMs, live: false, endedMs: lastEndedMs, waitingOpen: sameDay };
      }
    }
  }

  // Data única.
  if (webinar.scheduled_at) {
    const startMs = new Date(webinar.scheduled_at).getTime();
    if (!Number.isNaN(startMs)) {
      let endMs: number | null = null;
      const end = parseTime(webinar.session_end_time);
      if (end) {
        const day = zoneParts(startMs, timezone);
        endMs = zonedTimeToMs(day.year, day.month, day.day, end.hour, end.minute, timezone);
        // Se a hora de fim for anterior à de início, a sessão termina no dia seguinte (calculado no fuso: numa
        // noite de mudança de hora, somar 24 h errava uma hora).
        if (endMs <= startMs) endMs = zonedTimeToMs(day.year, day.month, day.day + 1, end.hour, end.minute, timezone);
        endMs = fitVideo(startMs, endMs);
      } else if (duration) {
        endMs = startMs + duration;
      }
      return { startMs, endMs, live: startMs <= nowMs, endedMs: null, waitingOpen: true };
    }
  }

  return { startMs: null, endMs: null, live: false, endedMs: null, waitingOpen: true };
}

/* ---------- Ciclo de vida ---------- */

/**
 * Estado de uma sessão global: a mesma regra que a base de dados aplica de minuto a
 * minuto (sweep_webinar_sessions). As sessões são automáticas: começam sozinhas à hora
 * marcada. Sem fim conhecido (sem duração nem hora de fim), não se inventa o fim.
 */
export type SessionState = "scheduled" | "live" | "finished";

export function sessionState(
  startMs: number,
  endMs: number | null,
  nowMs = Date.now(),
): SessionState {
  if (nowMs < startMs) return "scheduled";
  if (endMs !== null && nowMs >= endMs) return "finished";
  return "live";
}

/**
 * Ciclo de vida de um webinar, igual em todas as páginas. Só há sessão global com data
 * única ou repetição automática. O just in time recomeça de minutos a minutos, e sem
 * horário cada pessoa vê a partir do início: nenhum dos dois tem um "terminou" global.
 * A sessão terminar não é a pessoa acabar de ver o vídeo.
 */
export type WebinarLifecycle =
  | { kind: "draft" }
  | { kind: "on_demand" }
  | { kind: "jit"; intervalMinutes: number }
  | {
      kind: "session";
      state: SessionState;
      startMs: number;
      endMs: number | null;
      /** Fim da última sessão já terminada (repetição automática). */
      lastEndedMs: number | null;
    };

export function webinarLifecycle(
  webinar: ScheduleInput & { status?: string | null },
  nowMs = Date.now(),
): WebinarLifecycle {
  if (webinar.status === "draft") return { kind: "draft" };
  if (webinar.schedule_mode === "jit") {
    return { kind: "jit", intervalMinutes: Math.max(5, webinar.jit_interval_minutes ?? 15) };
  }
  const window = sessionWindow(webinar, nowMs);
  if (window.startMs === null) return { kind: "on_demand" };
  return {
    kind: "session",
    state: sessionState(window.startMs, window.endMs, nowMs),
    startMs: window.startMs,
    endMs: window.endMs,
    lastEndedMs: window.endedMs,
  };
}

export function lifecycleLabel(lifecycle: WebinarLifecycle) {
  switch (lifecycle.kind) {
    case "draft":
      return "Inativo";
    case "on_demand":
      return "Sob demanda";
    case "jit":
      return `A cada ${lifecycle.intervalMinutes} min`;
    case "session":
      if (lifecycle.state === "scheduled") return "Agendado";
      if (lifecycle.state === "finished") return "Terminado";
      // Começou, mas sem duração nem hora de fim não se sabe quando acaba.
      return lifecycle.endMs === null ? "Iniciado" : "Em andamento";
  }
}

/** Uma frase com as horas do ciclo de vida, para dicas e cabeçalhos. */
export function lifecycleDetail(lifecycle: WebinarLifecycle, timezone?: string | null) {
  const at = (ms: number) => formatSessionStart(ms, timezone);
  switch (lifecycle.kind) {
    case "draft":
      return "A sala está fechada até o webinar ser activado.";
    case "on_demand":
      return "Sem horário: cada pessoa vê desde o início. Não há uma sessão global que termine.";
    case "jit":
      return `Recomeça a cada ${lifecycle.intervalMinutes} minutos para quem chega. Não há um fim global: cada sessão com inscritos termina à sua hora.`;
    case "session":
      if (lifecycle.state === "scheduled")
        return `Começa ${at(lifecycle.startMs)}.${lifecycle.lastEndedMs ? ` A anterior terminou ${at(lifecycle.lastEndedMs)}.` : ""}`;
      if (lifecycle.state === "finished")
        return `Terminou ${at(lifecycle.endMs ?? lifecycle.startMs)}.`;
      return lifecycle.endMs === null
        ? `Começou ${at(lifecycle.startMs)}; sem duração nem hora de fim, não termina sozinha.`
        : `Começou ${at(lifecycle.startMs)} e termina ${at(lifecycle.endMs)}.`;
  }
}

export function formatSessionStart(ms: number, timezone?: string | null) {
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: safeZone(timezone),
  }).format(new Date(ms));
}
