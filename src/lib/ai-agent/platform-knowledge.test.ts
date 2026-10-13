import { describe, expect, it } from "vitest";
import { platformKnowledge, type PlatformColumns } from "./platform-knowledge";

const webinar: PlatformColumns = {
  status: "active",
  slug: "aula-ia",
  public_title: "Aprenda a trabalhar com IA",
  description: "",
  host_name: "Amado Ruben",
  host_role: "Fundador",
  duration_seconds: 2700,
  replay_enabled: true,
  registration_headline: "Aprenda a trabalhar com IA",
  registration_subtitle: "Aula gratuita.",
  schedule_mode: "scheduled",
  scheduled_at: "2026-10-12T19:00:00Z",
  timezone: "Africa/Luanda",
};
const now = new Date("2026-10-08T12:00:00Z").getTime();
const opts = { productName: "Mentoria IA", appUrl: "https://novawebinar.vercel.app/", nowMs: now };
const byLabel = (lines: { label: string; text: string }[]) => Object.fromEntries(lines.map((l) => [l.label, l.text]));

describe("o que a plataforma diz ao Agente", () => {
  it("junta webinar, produto, agenda e página de inscrição", () => {
    const k = byLabel(platformKnowledge(webinar, opts));
    expect(k["Webinar"]).toBe("Live: «Aprenda a trabalhar com IA». Apresentado por Amado Ruben (Fundador). Dura cerca de 45 min.");
    expect(k["Produto"]).toBe("Produto à venda: Mentoria IA.");
    // A próxima sessão, na hora do fuso do webinar (20:00 em Luanda).
    expect(k["Agenda"]).toContain("Começa segunda-feira, 12 de outubro");
    expect(k["Agenda"]).toContain("20:00");
    expect(k["Agenda"]).toContain("Fuso horário: Africa/Luanda.");
    expect(k["Agenda"]).toContain("Há gravação");
    expect(k["Página de inscrição"]).toBe(
      "Página de inscrição. Link para se inscrever: https://novawebinar.vercel.app/w/aula-ia. Subtítulo: Aula gratuita.",
    );
  });

  it("just in time e sem horário dizem-se como a sala os mostra", () => {
    const jit = byLabel(platformKnowledge({ ...webinar, schedule_mode: "jit", jit_interval_minutes: 15 }, opts));
    expect(jit["Agenda"]).toContain("Recomeça a cada 15 minutos");
    const none = byLabel(platformKnowledge({ ...webinar, schedule_mode: "ondemand", scheduled_at: null }, opts));
    expect(none["Agenda"]).toContain("Sem horário");
  });

  it("o que está vazio não entra; sem endereço público não inventa o link", () => {
    const k = byLabel(
      platformKnowledge(
        { ...webinar, host_name: "", duration_seconds: 0, replay_enabled: false, registration_subtitle: "" },
        { ...opts, productName: " ", appUrl: "" },
      ),
    );
    expect(k["Webinar"]).toBe("Live: «Aprenda a trabalhar com IA».");
    expect(k["Produto"]).toBeUndefined();
    expect(k["Agenda"]).not.toContain("gravação");
    expect(k["Página de inscrição"]).toBeUndefined();
  });
});
