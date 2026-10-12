/**
 * Empurra a fila de trabalhos a partir do próprio servidor, para a geração do
 * chat, a sincronização e as automações continuarem com o separador fechado.
 *
 * Várias instâncias podem correr ao mesmo tempo: cada trabalho é reservado por
 * uma escrita condicional (`locked_until`), por isso só uma o avança.
 *
 * ponytail: depende de um processo permanente (o preset node-server actual).
 * Em alojamento serverless não corre; aí agenda-se uma chamada de minuto a
 * minuto a /api/public/run-jobs com o cabeçalho x-job-runner-token.
 */
const TICK_MS = 15_000;
const slot = globalThis as { __jobTicker?: ReturnType<typeof setInterval> };

/**
 * Duas passagens independentes: um trabalho longo de IA não atrasa as automações.
 * As automações prontas vêm da base de dados (automation_runs_tick); aqui só se executam.
 */
const PASSES = {
  jobs: () => import("@/lib/job-runner.server").then(({ runPendingJobs }) => runPendingJobs(50_000)),
  automations: () => import("@/lib/automations.server").then(({ runDueAutomations }) => runDueAutomations()),
};

export function startJobTicker() {
  // JOB_TICKER=off desliga-o onde a fila já é empurrada por uma chamada agendada. Na Vercel nunca corre: a
  // função é congelada entre pedidos e o relógio acordava a meio, com o fetch a falhar de minuto a minuto;
  // aí a fila é empurrada pela chamada agendada a /api/public/run-jobs (pg_cron + pg_net).
  if (slot.__jobTicker || process.env["JOB_TICKER"] === "off" || process.env["VERCEL"]) return;
  const running = new Set<string>();
  slot.__jobTicker = setInterval(() => {
    for (const [name, pass] of Object.entries(PASSES)) {
      if (running.has(name)) continue;
      running.add(name);
      void pass()
        .catch((error: unknown) => console.error(`[${name}] passagem falhada`, error))
        .finally(() => running.delete(name));
    }
  }, TICK_MS);
  // Não segura o processo aberto quando o servidor quer terminar.
  slot.__jobTicker.unref?.();
}
