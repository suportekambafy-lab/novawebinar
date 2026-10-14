/**
 * Quem regressa à sala (versão B de .scratch/arnes/regresso-e-agenda.md): a sala segue a sessão de
 * cada pessoa, não a próxima sessão do webinar. Contas puras; os dados vêm de room-viewer.server.
 */

/** O que a sala sabe de quem já entrou: a sessão dela, até onde viu e se já comprou. */
export type ViewerState = {
  session: { startsAt: string; endsAt: string | null } | null;
  watchedSeconds: number;
  bought: boolean;
};

export type ViewerPlan =
  /** Sem sessão própria (replay pelo link, sala de teste, webinar sem horário): a sala de sempre. */
  | { kind: "global" }
  /** A sessão dela ainda não acabou: espera por ela, ou entra ao vivo no ponto certo. */
  | { kind: "session"; startMs: number }
  /** A sessão dela acabou e há replay: retoma onde ficou, como gravação (nunca outra vez «Ao vivo»). */
  | { kind: "replay"; resumeSeconds: number }
  /** Acabou, sem replay: a sessão dela terminou (sem convite para «a próxima» como se fosse nova). */
  | { kind: "ended"; startMs: number }
  /** Acabou e já comprou: tem acesso, não volta a ver a venda. */
  | { kind: "bought" };

/** O horário actual do webinar (as colunas de `webinars`). */
export type WebinarSchedule = {
  schedule_mode?: string | null;
  recurrence_enabled?: boolean | null;
  scheduled_at?: string | null;
};

/**
 * A sessão ainda é deste webinar: na repetição e no just in time todas são; numa data única só a da
 * data marcada (a mesma regra do arranque das sessões na base, sweep_webinar_sessions). Uma data
 * remarcada, ou um webinar que passou a «Sempre disponível», deixa a sessão antiga sem efeito.
 */
export function sessionOfWebinar(startMs: number, schedule: WebinarSchedule) {
  if (schedule.schedule_mode === "jit" || schedule.recurrence_enabled) return true;
  return schedule.scheduled_at ? Date.parse(schedule.scheduled_at) === startMs : false;
}

export function viewerPlan(
  state: ViewerState | null | undefined,
  options: { nowMs: number; durationSeconds: number; replayEnabled: boolean; schedule: WebinarSchedule },
): ViewerPlan {
  const startMs = state?.session ? Date.parse(state.session.startsAt) : Number.NaN;
  if (!state?.session || !Number.isFinite(startMs)) return { kind: "global" };
  // Data remarcada (ou agora sempre disponível): a sessão antiga nunca arranca; segue a do webinar.
  if (!sessionOfWebinar(startMs, options.schedule)) return { kind: "global" };
  const endMs = state.session.endsAt
    ? Date.parse(state.session.endsAt)
    : options.durationSeconds > 0
      ? startMs + options.durationSeconds * 1000
      : null;
  if (endMs === null || !Number.isFinite(endMs) || endMs > options.nowMs) return { kind: "session", startMs };
  if (state.bought) return { kind: "bought" };
  // O webinar repete (repetição, just in time): a sessão dela acabou e a próxima é outra live. Quem volta
  // pelo link de sempre entra na sessão seguinte (espera, depois ao vivo), como numa nova inscrição; o
  // replay fica para o link do replay (?replay=1). Sem isto, quem já tinha entrado um dia via «Replay»
  // no dia seguinte, em vez da live, e a sala nunca mais lhe parecia ao vivo.
  const repeats = options.schedule.schedule_mode === "jit" || Boolean(options.schedule.recurrence_enabled);
  if (repeats) return { kind: "global" };
  if (options.replayEnabled) return { kind: "replay", resumeSeconds: Math.max(0, state.watchedSeconds) };
  return { kind: "ended", startMs };
}

/**
 * Uma segunda inscrição fica na sessão original (o evento de inscrição junta por pessoa, webinar e
 * sessão, e não se repete: nem aquecimento nem lembretes outra vez) enquanto ela não acabou, ou se a
 * pessoa já viu alguma coisa. Quem nunca entrou numa sessão que já acabou inscreve-se na seguinte.
 */
export function keepOriginalSession(endMs: number | null, watched: boolean, nowMs: number, repeats = false) {
  const open = endMs === null || endMs > nowMs;
  // Num webinar que repete, uma sessão acabada é passado: a inscrição nova vai para a sessão actual ou a próxima.
  return open || (!repeats && watched);
}

/** O webinar abre outra sessão depois desta (repetição automática ou just in time)? */
export function repeatsSessions(schedule: WebinarSchedule) {
  return schedule.schedule_mode === "jit" || Boolean(schedule.recurrence_enabled);
}
