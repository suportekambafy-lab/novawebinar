/**
 * Os testes A/B que entram no hero do Painel como slides: só os activos, primeiro o do webinar em destaque.
 */
import type { AbTestSummary } from "@/lib/ab-tests/ab-tests.functions";

export function activeHeroTests(tests: AbTestSummary[] | undefined, webinarId: string | null) {
  const active = (tests ?? []).filter((t) => t.test.status === "active");
  const featured = webinarId ? active.filter((t) => t.variants.some((v) => v.webinar_id === webinarId)) : [];
  return [...featured, ...active.filter((t) => !featured.includes(t))];
}
