/** Que tutorial cada página mostra. Fica à parte para o menu não carregar os tutoriais. */
export type TutorialId = "criar-webinar" | "atendimento" | "automacoes" | "analises";

export function tutorialFor(pathname: string): TutorialId | null {
  if (pathname === "/webinars" || pathname === "/webinars/new" || /^\/webinars\/[^/]+\/edit$/.test(pathname)) return "criar-webinar";
  if (pathname === "/support") return "atendimento";
  if (pathname === "/automations" || pathname.startsWith("/automations/")) return "automacoes";
  if (pathname === "/analytics") return "analises";
  return null;
}
