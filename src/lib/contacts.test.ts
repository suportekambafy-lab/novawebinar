import { describe, expect, it } from "vitest";

import {
  buildJourney,
  contactInsight,
  leadSource,
  parseContactsCsv,
  relativeDays,
  sourceLabel,
  sourceVerdict,
  timelineItems,
  whatsappLink,
  type ContactSummary,
} from "./contacts";

const NOW = Date.parse("2026-09-26T12:00:00Z");

function contact(over: Partial<ContactSummary>): ContactSummary {
  return {
    clicked_offer: false,
    created_at: "2026-09-01T00:00:00Z",
    email: "ana@exemplo.pt",
    events_attended: 0,
    events_registered: 0,
    first_campaign: null,
    first_seen_at: null,
    first_source: "direto",
    id: "c1",
    last_seen_at: "2026-09-25T12:00:00Z",
    list_ids: [],
    messages: 0,
    name: "Ana Silva",
    organization_id: "o1",
    phone: null,
    purchases: 0,
    reached_offer: false,
    source: "registration",
    stage: "new",
    watched_seconds: 0,
    webinar_ids: [],
    checkout_started: false,
    payment_failed: false,
    checkout_abandoned: false,
    ...over,
  };
}

describe("contactInsight", () => {
  it("clicou e não comprou é quente, arrefece com o tempo", () => {
    const c = contact({ stage: "clicked", events_registered: 2, events_attended: 2, phone: "+244923000000" });
    const hot = contactInsight(c, NOW);
    expect(hot.temperature).toBe("hot");
    expect(hot.reason).toBe("Assistiu a 2 de 2 eventos, clicou na oferta e não iniciou o pagamento.");
    expect(hot.nextAction.channel).toBe("whatsapp");
    expect(hot.nextAction.message).toContain("Olá Ana");
    const later = contactInsight({ ...c, last_seen_at: "2026-08-01T00:00:00Z" }, NOW);
    expect(later.temperature).toBe("warm");
  });

  it("explica quem se inscreveu e não apareceu", () => {
    const i = contactInsight(contact({ stage: "no_show", events_registered: 1 }), NOW);
    expect(i.temperature).toBe("cold");
    expect(i.reason).toBe("Inscreveu-se em 1 evento e não apareceu.");
    expect(i.nextAction.channel).toBe("email");
  });

  it("quem volta a vários eventos aquece mesmo sem ver a oferta", () => {
    const i = contactInsight(contact({ stage: "watched", events_registered: 3, events_attended: 2 }), NOW);
    expect(i.temperature).toBe("warm");
    expect(i.nextAction.label).toContain("já voltou 2 vezes");
  });

  it("importado sem eventos e etapa desconhecida caem em 'new'", () => {
    const i = contactInsight(contact({ stage: "???", source: "import" }), NOW);
    expect(i.stage).toBe("new");
    expect(i.reason).toBe("Importado, ainda sem eventos.");
  });

  it("cliente", () => {
    const i = contactInsight(contact({ stage: "customer", purchases: 2, events_registered: 1, events_attended: 1 }), NOW);
    expect(i.temperature).toBe("customer");
    expect(i.reason).toBe("Assistiu a 1 de 1 evento, comprou 2 vezes.");
  });
});

describe("whatsappLink", () => {
  it("usa só dígitos e codifica a mensagem", () => {
    expect(whatsappLink("+244 923 456 789", "Olá Ana")).toBe("https://wa.me/244923456789?text=Ol%C3%A1%20Ana");
    expect(whatsappLink("123")).toBeNull();
  });
});

describe("leadSource", () => {
  const own = "app.exemplo.com";
  it("UTM ganha a tudo e a fonte fica em minúsculas", () => {
    expect(
      leadSource({ utm_source: " Instagram ", utm_campaign: "Lançamento Set", referrer: "https://l.facebook.com/", ownHost: own }),
    ).toEqual({
      utmSource: "instagram",
      utmMedium: undefined,
      utmCampaign: "Lançamento Set",
      utmContent: undefined,
      referrer: "l.facebook.com",
    });
  });
  it("sem UTM usa os ids de clique dos anúncios", () => {
    expect(leadSource({ gclid: "x", referrer: "", ownHost: own }).utmSource).toBe("google");
    expect(leadSource({ fbclid: "x", referrer: "", ownHost: own }).utmSource).toBe("facebook");
  });
  it("sem UTM nem clique usa o site de origem, ignorando o próprio domínio", () => {
    expect(leadSource({ referrer: "https://l.instagram.com/?u=1", ownHost: own }).utmSource).toBe("instagram");
    expect(leadSource({ referrer: "https://web.whatsapp.com/", ownHost: own }).utmSource).toBe("whatsapp");
    expect(leadSource({ referrer: "https://blog.cliente.ao/post", ownHost: own }).utmSource).toBe("blog.cliente.ao");
    expect(leadSource({ referrer: "https://app.exemplo.com/w/x", ownHost: own }).utmSource).toBeUndefined();
    expect(leadSource({ referrer: "", ownHost: own }).utmSource).toBeUndefined();
  });
});

describe("sourceVerdict", () => {
  it("não compara origens com poucos contactos", () => {
    expect(
      sourceVerdict([
        { source: "instagram", contacts: 12, customers: 3, clicked: 5 },
        { source: "facebook", contacts: 4, customers: 2, clicked: 2 },
      ]),
    ).toContain("Ainda é cedo");
  });
  it("aponta a origem que mais vende, contra a média total", () => {
    expect(
      sourceVerdict([
        { source: "direto", contacts: 50, customers: 1, clicked: 4 },
        { source: "instagram", contacts: 20, customers: 4, clicked: 8 },
        { source: "facebook", contacts: 30, customers: 1, clicked: 6 },
      ]),
    ).toBe("Instagram é a origem que mais converte: 20% compram, contra 6% no total.");
  });
  it("sem vendas ainda, compara cliques na oferta", () => {
    expect(
      sourceVerdict([
        { source: "whatsapp", contacts: 10, customers: 0, clicked: 5 },
        { source: "youtube", contacts: 10, customers: 0, clicked: 1 },
      ]),
    ).toBe("WhatsApp é a origem que mais converte: 50% clicam na oferta, contra 30% no total.");
  });

  it("escreve as marcas como elas se escrevem", () => {
    expect(["youtube", "whatsapp", "tiktok", "instagram", null].map(sourceLabel)).toEqual([
      "YouTube",
      "WhatsApp",
      "TikTok",
      "Instagram",
      "Direto / sem origem",
    ]);
  });
});

describe("parseContactsCsv", () => {
  it("lê o CSV do Excel português (;), com aspas e acentos no cabeçalho", () => {
    const csv = '﻿Nome do contacto;E-mail;Telemóvel\r\n"Silva; Ana";ANA@Exemplo.pt;+351 912 345 678\r\nRui;;923456789\r\nSem canal;invalido;\r\n';
    const { rows, skipped } = parseContactsCsv(csv);
    expect(rows).toEqual([
      { name: "Silva; Ana", email: "ana@exemplo.pt", phone: "+351 912 345 678" },
      { name: "Rui", email: "", phone: "923456789" },
    ]);
    expect(skipped).toBe(1);
  });

  it("lê CSV com vírgulas e cabeçalhos em inglês", () => {
    const { rows } = parseContactsCsv("Full Name,Email,Phone\nJohn Doe,john@x.com,+15551234567\n");
    expect(rows).toEqual([{ name: "John Doe", email: "john@x.com", phone: "+15551234567" }]);
  });

  it("sem cabeçalho, adivinha as colunas pelo conteúdo", () => {
    const { rows } = parseContactsCsv("maria@x.pt,Maria,+244923456789\n");
    expect(rows).toEqual([{ name: "Maria", email: "maria@x.pt", phone: "+244923456789" }]);
  });
});

describe("contactInsight: pagamento", () => {
  it("pagamento falhado pede ajuda para pagar, não um convite", () => {
    const i = contactInsight(
      contact({ stage: "checkout", events_registered: 1, events_attended: 1, checkout_started: true, payment_failed: true }),
      NOW,
    );
    expect([i.stage, i.temperature]).toEqual(["checkout", "hot"]);
    expect(i.reason).toBe("Assistiu a 1 de 1 evento, o pagamento falhou.");
    expect(i.nextAction.label).toBe("Ajudar a pagar: o pagamento falhou");
  });

  it("pagamento abandonado pede para recuperar", () => {
    const i = contactInsight(
      contact({ stage: "checkout", events_registered: 1, events_attended: 1, checkout_started: true, checkout_abandoned: true }),
      NOW,
    );
    expect(i.reason).toBe("Assistiu a 1 de 1 evento, iniciou o pagamento e não concluiu.");
  });
});

describe("buildJourney", () => {
  it("ordena do mais recente e separa tempo visto de posição", () => {
    const steps = buildJourney({
      participations: [
        {
          // Entrou aos 20 min, chegou aos 50 min, mas só viu 15 min.
          participant_id: "p1",
          webinar_id: "w1",
          webinar_title: "Aula 1",
          joined_at: "2026-09-10T20:00:00Z",
          viewing_mode: "live",
          duration_seconds: 3600,
          offer_start_seconds: 1500,
          entry_seconds: 1200,
          peak_seconds: 3000,
          actual_watch_seconds: 900,
          watch_measured: true,
          watch_ratio: 0.25,
          attended: true,
          saw_offer: true,
          clicked: false,
          checkout_started: false,
          purchased: false,
          payment_failed: false,
          checkout_abandoned: false,
          refunded: false,
        },
      ],
      clicks: [
        { participant_id: "p1", occurred_at: "2026-09-10T20:40:00Z", video_second: 2100 },
        { participant_id: "p1", occurred_at: "2026-09-10T20:30:00Z", video_second: 1560 },
      ],
      messages: [{ participant_id: "p1" }, { participant_id: "p1" }, { participant_id: "outro" }],
      purchases: [
        {
          id: "b1",
          created_at: "2026-09-11T09:00:00Z",
          status_at: "2026-09-11T09:00:00Z",
          product_name: "Curso",
          amount: "",
          amount_value: 97,
          currency: "EUR",
          status: "approved",
          provider: "hotmart",
        },
      ],
    });
    expect(steps.map((s) => s.kind)).toEqual(["purchase", "event"]);
    const event = steps[1];
    if (event?.kind !== "event") throw new Error("esperava um evento");
    expect([
      event.attended,
      event.watchedSeconds,
      event.watchMeasured,
      event.entrySeconds,
      event.peakSeconds,
      event.watchedPct,
      event.offerAtPct,
      event.reachedOffer,
      event.clicked,
      event.clickedAtSecond,
      event.messages,
    ]).toEqual([true, 900, true, 1200, 3000, 25, 42, true, true, 1560, 2]);
  });
});

describe("linha do tempo", () => {
  it("junta repetições seguidas e mantém o fim da sessão à parte", () => {
    const row = (name: string, at: string, data: unknown = {}) => ({
      name,
      occurred_at: at,
      webinar_id: "w1",
      session_id: "s1",
      video_second: null,
      data: data as never,
    });
    const items = timelineItems([
      row("webinar_session_ended", "2026-10-12T20:00:00Z"),
      row("payment_failed", "2026-10-12T19:58:00Z", { product: "Curso" }),
      row("checkout_started", "2026-10-12T19:55:00Z", { product: "Curso" }),
      row("offer_viewed", "2026-10-12T19:50:00Z"),
      row("offer_viewed", "2026-10-12T19:49:00Z"),
      row("offer_viewed", "2026-10-12T19:48:00Z"),
      row("registered", "2026-10-12T18:00:00Z"),
    ]);
    expect(items.map((i) => [i.label, i.times, i.detail])).toEqual([
      ["A sessão terminou", 1, null],
      ["O pagamento falhou", 1, "Curso"],
      ["Iniciou o pagamento", 1, "Curso"],
      ["Viu a oferta", 3, null],
      ["Inscreveu-se", 1, null],
    ]);
  });

  it("hoje e ontem são dias de calendário, não 12 horas", () => {
    const now = new Date(2026, 8, 29, 6, 0).getTime();
    expect(relativeDays(new Date(2026, 8, 28, 17, 50).toISOString(), now)).toBe("ontem");
    expect(relativeDays(new Date(2026, 8, 28, 23, 59).toISOString(), now)).toBe("ontem");
    expect(relativeDays(new Date(2026, 8, 29, 0, 5).toISOString(), now)).toBe("hoje");
  });

  it("no mesmo instante segue a ordem lógica: pagamento, compra, automação", () => {
    const at = "2026-10-12T19:55:00.123Z";
    const row = (name: string) => ({ name, occurred_at: at, webinar_id: "w1", session_id: "s1", video_second: null, data: {} as never });
    const items = timelineItems([row("checkout_started"), row("automation_entered"), row("purchase_approved")]);
    // Da mais recente para a mais antiga, como a ficha as recebe.
    expect(items.map((i) => i.name)).toEqual(["automation_entered", "purchase_approved", "checkout_started"]);
  });
});

describe("mensagens sugeridas falam do evento, não de «webinar»", () => {
  it("usa o tema do evento e nunca a palavra webinar", async () => {
    const { contactInsight: insight, eventTopic } = await import("./contacts");
    expect(eventTopic("Workshop Marca Milionária Legacy")).toBe("Marca Milionária Legacy");
    expect(eventTopic("Faturando com Leilões")).toBe("Faturando com Leilões");
    const c = { name: "Nelson Silva", stage: "clicked", events_registered: 1, events_attended: 1, clicked_offer: true } as never;
    const i = insight(c, Date.now(), "Workshop Marca Milionária Legacy");
    expect(i.nextAction.message).toBe(
      "Olá Nelson, vi que se interessou pela oferta da aula sobre Marca Milionária Legacy. Ficou alguma dúvida que eu possa esclarecer?",
    );
    for (const stage of ["clicked", "reached_offer", "watched", "no_show", "new", "checkout", "customer"]) {
      expect(insight({ ...(c as object), stage } as never).nextAction.message).not.toMatch(/webinar/i);
    }
  });
});
