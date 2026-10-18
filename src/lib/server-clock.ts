/**
 * O relógio do servidor no browser. A sala segue a hora marcada da sessão: com o relógio do telemóvel
 * adiantado 5 minutos, a pessoa saltava os primeiros 5 minutos e via «Terminou» 5 minutos antes. Mede-se a
 * diferença uma vez por visita e corrige-se a hora usada contra horas do servidor.
 */
let offsetMs = 0;

/** A hora do servidor estimada a partir de uma hora do browser (por omissão, agora). */
export function serverNow(localMs = Date.now()) {
  return localMs + offsetMs;
}

/**
 * A diferença a partir de uma ida e volta: o servidor respondeu `serverMs` a meio do caminho. Diferenças
 * pequenas (rede, arredondamentos) ou absurdas ficam a zero.
 */
export function clockOffset(serverMs: number, sentAtMs: number, receivedAtMs: number) {
  if (!Number.isFinite(serverMs) || receivedAtMs < sentAtMs) return 0;
  const offset = serverMs + (receivedAtMs - sentAtMs) / 2 - receivedAtMs;
  return Math.abs(offset) < 2000 || Math.abs(offset) > 24 * 3600_000 ? 0 : Math.round(offset);
}

export function setClockOffset(ms: number) {
  offsetMs = ms;
}
