import { describe, expect, it, vi } from "vitest";

// O menu só precisa das regras de quem vê o quê; a base de dados fica de fora.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { navGroups, phoneNav } = await import("./dashboard-sidebar");

const paths = (items: { to: string }[]) => items.map((it) => it.to);

describe("menu da aplicação", () => {
  it("computador: o dia a dia em cima, depois pessoas, dados e conta", () => {
    expect(navGroups("owner").map((g) => [g.heading, paths(g.items)])).toEqual([
      ["Principal", ["/dashboard", "/webinars", "/calendar", "/automations", "/library"]],
      ["Pessoas", ["/support", "/cases", "/contacts"]],
      ["Dados", ["/live-view", "/analytics", "/ab-tests", "/intelligence"]],
      ["Conta", ["/team", "/integrations", "/credits"]],
    ]);
  });

  it("telemóvel: os quatro separadores de baixo são os mesmos do topo da barra lateral", () => {
    expect(paths(phoneNav("owner").tabs)).toEqual(["/dashboard", "/webinars", "/calendar", "/automations"]);
    expect(phoneNav("owner").tabs[0]).toMatchObject({ label: "Painel", exact: true });
  });

  it.each(["owner", "admin", "member", "support", undefined] as const)(
    "telemóvel (%s): cada entrada aparece uma vez, em baixo ou no «Mais»",
    (role) => {
      const { tabs, more } = phoneNav(role);
      const phone = [...paths(tabs), ...more.flatMap((g) => paths(g.items))];
      const desktop = navGroups(role).flatMap((g) => paths(g.items));
      expect(new Set(phone).size).toBe(phone.length);
      expect([...phone].sort()).toEqual([...desktop].sort());
      expect(more.every((g) => g.items.length > 0)).toBe(true);
    },
  );

  it("quem só atende fica com o atendimento à mão e sem páginas que não pode abrir", () => {
    expect(paths(phoneNav("support").tabs)).toEqual(["/support", "/cases", "/contacts"]);
    expect(phoneNav("support").more).toEqual([]);
  });
});
