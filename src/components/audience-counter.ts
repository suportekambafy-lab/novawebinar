import { useEffect, useMemo, useState } from "react";

type CurvePoint = { at: number; viewers: number };

/**
 * A curva guardada pelo estúdio é uma lista simples de valores distribuídos
 * do início ao fim da sessão. Também aceitamos o formato antigo com objetos
 * {at, viewers} para não partir webinars antigos.
 */
function parseCurve(curve: unknown, durationSeconds: number): CurvePoint[] {
  if (!Array.isArray(curve) || curve.length === 0) return [];

  const numbers = curve.map((value) => Number(value));
  if (numbers.every((value) => Number.isFinite(value))) {
    const span = durationSeconds > 0 ? durationSeconds : 45 * 60;
    const last = Math.max(1, numbers.length - 1);
    return numbers.map((viewers, index) => ({ at: (index / last) * span, viewers }));
  }

  return curve
    .map((point) => {
      if (typeof point !== "object" || point === null) return null;
      const record = point as Record<string, unknown>;
      const at = Number(record["at"] ?? record["second"] ?? record["offset_seconds"]);
      const viewers = Number(record["viewers"] ?? record["value"] ?? record["count"]);
      if (!Number.isFinite(at) || !Number.isFinite(viewers)) return null;
      return { at, viewers } satisfies CurvePoint;
    })
    .filter((point): point is CurvePoint => point !== null)
    .sort((a, b) => a.at - b.at);
}

/** Crescimento suave quando não existe curva configurada. */
function defaultCurve(seconds: number): number {
  const minutes = seconds / 60;
  const ramp = 1 - Math.exp(-minutes / 6);
  const wave = Math.sin(minutes / 1.7) * 6 + Math.sin(minutes / 0.6) * 2;
  return Math.max(1, Math.round(38 + 290 * ramp + wave));
}

function fromCurve(points: CurvePoint[], seconds: number): number {
  if (points.length === 0) return defaultCurve(seconds);
  if (seconds <= points[0]!.at) return Math.max(0, Math.round(points[0]!.viewers));
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    if (seconds <= current.at) {
      const span = Math.max(1, current.at - previous.at);
      const ratio = (seconds - previous.at) / span;
      return Math.round(previous.viewers + (current.viewers - previous.viewers) * ratio);
    }
  }
  return Math.round(points[points.length - 1]!.viewers);
}

/**
 * Número de espectadores mostrado na sala pública.
 * "real" conta participantes reais, "simulated" segue a curva definida no
 * estúdio (começa exatamente na audiência mínima) e "hybrid" soma as duas.
 */
export function useAudienceCount({
  webinarId,
  seconds,
  mode,
  curve,
  durationSeconds = 0,
  realCount: providedRealCount,
}: {
  webinarId: string;
  seconds: number;
  mode: string | undefined;
  curve: unknown;
  durationSeconds?: number;
  realCount?: number;
}) {
  const [fetchedRealCount, setFetchedRealCount] = useState(0);
  const points = useMemo(() => parseCurve(curve, durationSeconds), [curve, durationSeconds]);
  const wantsReal = (mode === "real" || mode === "hybrid") && providedRealCount === undefined;

  useEffect(() => {
    if (!wantsReal) return;
    let cancelled = false;
    const load = async () => {
      // Pelo servidor: a RLS não deixa o browser contar participantes (antes dava sempre 0).
      try {
        const { getRoomLiveCount } = await import("@/lib/public-room.functions");
        const count = await getRoomLiveCount({ data: { webinarId } });
        if (!cancelled) setFetchedRealCount(count);
      } catch {
        /* fica a última contagem */
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [webinarId, wantsReal]);

  const realCount = providedRealCount ?? fetchedRealCount;
  if (mode === "real") return realCount;
  const simulated = fromCurve(points, seconds);
  return mode === "hybrid" ? simulated + realCount : simulated;
}
