import { describe, expect, it } from "vitest";
import {
  audienceCenter,
  countryCodeOf,
  countryLabel,
  flagOf,
  groupByRegion,
  orthographic,
  wholeShares,
} from "./analytics-geo";
import { analyticsSummary, ctaConversion, dailySeries, funnelSteps, peopleOf, type AnalyticsFact } from "./analytics";
import { activityByMinute, liveNow, sessionsOf, spotsOf } from "./analytics-live";
import { funnelSummary } from "./participant-facts";
import { publicName, publicPlace, type LiveViewer } from "./live-presence";

const fact = (over: Partial<AnalyticsFact>): AnalyticsFact => ({
  person_id: "ana",
  webinar_id: "w1",
  viewing_mode: "live",
  attended: true,
  actual_watch_seconds: 600,
  entry_seconds: 0,
  peak_seconds: 600,
  reached_pitch: false,
  duration_seconds: 3600,
  saw_offer: false,
  clicked: false,
  checkout_started: false,
  purchased: false,
  payment_failed: false,
  checkout_abandoned: false,
  refunded: false,
  joined_at: "2026-10-08T20:00:00.000Z",
  device: "desktop",
  country: null,
  city: null,
  webinar_title: "Aula de Excel",
  ...over,
});

const viewer = (over: Partial<LiveViewer>): LiveViewer => ({
  key: Math.random().toString(36),
  webinarId: "w1",
  webinarTitle: "Aula de Excel",
  name: "Ana",
  mode: "live",
  device: "desktop",
  city: "Luanda",
  country: "Angola",
  countryCode: "AO",
  lat: -8.8,
  lon: 13.2,
  checkout: false,
  offer: null,
  joinedAt: "2026-10-09T10:00:00.000Z",
  ...over,
});

describe("de onde vem a audiência", () => {
  it("reconhece o país pelo código ou pelo nome, em inglês ou português", () => {
    expect(countryCodeOf("ao")).toBe("AO");
    expect(countryCodeOf(null, "Brazil")).toBe("BR");
    expect(countryCodeOf(null, "Brasil")).toBe("BR");
    expect(countryCodeOf(null, "United States")).toBe("US");
    expect(countryCodeOf(null, "DR Congo")).toBe("CD");
    expect(countryCodeOf(null, "Atlântida")).toBeNull();
    expect(countryLabel("US")).toBe("Estados Unidos");
    expect(flagOf("PT")).toBe("🇵🇹");
  });

  it("agrupa por região e país; quem não tem origem fica de fora das percentagens", () => {
    const { regions, known, unknown } = groupByRegion([
      { country: "Angola", countryCode: "AO" },
      { country: "Angola", countryCode: "AO" },
      { country: "Mozambique" },
      { country: "Portugal" },
      { country: null },
    ]);
    expect(known).toBe(4);
    expect(unknown).toHaveLength(1);
    expect(regions.map((r) => [r.label, r.count, r.share])).toEqual([
      ["África", 3, 75],
      ["Europa", 1, 25],
    ]);
    expect(regions[0]!.countries.map((c) => [c.label, c.count])).toEqual([
      ["Angola", 2],
      ["Moçambique", 1],
    ]);
  });

  it("um país desconhecido fica em «Outras», com o nome que veio", () => {
    const { regions } = groupByRegion([{ country: "Atlântida" }]);
    expect(regions[0]!.label).toBe("Outras");
    expect(regions[0]!.countries[0]!.label).toBe("Atlântida");
  });

  it("as percentagens inteiras somam sempre 100", () => {
    expect(wholeShares([1, 1, 1])).toEqual([34, 33, 33]);
    expect(wholeShares([0, 0])).toEqual([0, 0]);
  });

  it("o globo mostra o centro de frente e esconde o outro lado", () => {
    const front = orthographic(-8.8, 13.2, -8.8, 13.2);
    expect([front.x, front.y, front.visible]).toEqual([0, 0, true]);
    expect(orthographic(8.8, -166.8, -8.8, 13.2).visible).toBe(false);
    const center = audienceCenter([
      { lat: 0, lon: 10 },
      { lat: 0, lon: 30 },
    ]);
    expect(center!.lon).toBeCloseTo(20);
    expect(audienceCenter([])).toBeNull();
  });
});

describe("contas das Análises", () => {
  const facts = [
    fact({ person_id: "ana", saw_offer: true, clicked: true, reached_pitch: true }),
    // A Ana entrou depois no telemóvel: o aparelho é o da entrada mais recente.
    fact({ person_id: "ana", device: "mobile", joined_at: "2026-10-08T20:30:00.000Z" }),
    fact({ person_id: "rui", saw_offer: true, reached_pitch: true }),
    fact({ person_id: "eva", attended: false, clicked: true, joined_at: "2026-10-07T20:00:00.000Z" }),
  ];

  it("o funil mostra a parte dos inscritos e a passagem de cada passo", () => {
    const steps = funnelSteps(funnelSummary(facts));
    expect(steps.map((s) => [s.label, s.value])).toEqual([
      ["Inscritos", 3],
      ["Assistiram", 2],
      ["Chegaram ao pitch", 2],
      ["Viram a oferta", 2],
      ["Clicaram na oferta", 1],
      ["Iniciaram o pagamento", 0],
      ["Compraram", 0],
    ]);
    expect(steps[1]!.share).toBeCloseTo(66.67, 1);
    expect(steps[4]!.pass).toBe(50);
    expect(steps[6]!.pass).toBe(0);
  });

  it("conversão no CTA é clicaram ÷ viram a oferta, e não existe sem oferta vista", () => {
    expect(ctaConversion({ clicked: 1, sawOffer: 2 })).toBe(50);
    expect(ctaConversion({ clicked: 0, sawOffer: 0 })).toBeNull();
  });

  it("uma pessoa por webinar, com o aparelho mais recente; clicar sem assistir não conta", () => {
    const people = peopleOf(facts);
    expect(people).toHaveLength(3);
    expect(people.find((p) => p.key === "ana:w1")?.device).toBe("mobile");
    expect(people.find((p) => p.key === "eva:w1")?.clicked).toBe(false);
  });

  it("participantes por dia no período escolhido, uma vez por webinar em cada dia", () => {
    const from = new Date(2026, 9, 7);
    const to = new Date(2026, 9, 10);
    const { days } = dailySeries(
      [
        { person_id: "ana", webinar_id: "w1", joined_at: new Date(2026, 9, 8, 20).toISOString() },
        { person_id: "ana", webinar_id: "w1", joined_at: new Date(2026, 9, 8, 21).toISOString() },
        { person_id: "rui", webinar_id: "w1", joined_at: new Date(2026, 9, 9, 9).toISOString() },
      ],
      { from: from.toISOString(), to: to.toISOString() },
    );
    expect(days.map((d) => [d.label, d.value])).toEqual([
      ["07/10", 0],
      ["08/10", 1],
      ["09/10", 1],
    ]);
  });

  it("facturação por moeda e por webinar", () => {
    const result = analyticsSummary(
      facts,
      [
        { amount_value: 100, currency: "AOA", webinar_id: "w1" },
        { amount_value: 50, currency: "AOA", webinar_id: "w1" },
        { amount_value: 20, currency: "EUR", webinar_id: "w2" },
      ],
      undefined,
    );
    expect(result.revenue).toEqual([
      { currency: "AOA", amount: 150 },
      { currency: "EUR", amount: 20 },
    ]);
    expect(result.webinars[0]!.revenue).toEqual([{ currency: "AOA", amount: 150 }]);
    expect(result.devices).toEqual({ mobile: 1, desktop: 2, unknown: 0 });
  });
});

describe("vista ao vivo", () => {
  it("conta quem está agora; «na oferta» só existe quando a sala o diz", () => {
    const viewers = [
      viewer({ mode: "replay", device: "mobile", checkout: true }),
      viewer({ lat: null, lon: null }),
    ];
    expect(liveNow(viewers)).toMatchObject({ total: 2, live: 1, replay: 1, mobile: 1, clicked: 1, onOffer: null, located: 1 });
    expect(liveNow([viewer({ offer: true }), viewer({ offer: false })]).onOffer).toBe(1);
  });

  it("agrupa por sítio e por webinar", () => {
    const viewers = [viewer({ checkout: true }), viewer({}), viewer({ webinarId: "w2", webinarTitle: "Outro", mode: "replay" })];
    expect(spotsOf(viewers).map((s) => [s.label, s.count, s.clicked])).toEqual([["Luanda, Angola", 3, 1]]);
    expect(sessionsOf(viewers).map((s) => [s.title, s.count, s.live, s.replay])).toEqual([
      ["Aula de Excel", 2, 2, 0],
      ["Outro", 1, 0, 1],
    ]);
  });

  it("a actividade ao minuto põe cada acontecimento no seu minuto e ignora o resto", () => {
    const now = Date.parse("2026-10-09T10:30:20.000Z");
    const buckets = activityByMinute(
      [
        { name: "started_watching", occurred_at: "2026-10-09T10:30:05.000Z" },
        { name: "offer_clicked", occurred_at: "2026-10-09T10:29:59.000Z" },
        { name: "purchase_approved", occurred_at: "2026-10-09T10:01:00.000Z" },
        // Fora da janela de 30 minutos e acontecimentos que não são da sala.
        { name: "started_watching", occurred_at: "2026-10-09T09:59:00.000Z" },
        { name: "automation_executed", occurred_at: "2026-10-09T10:30:00.000Z" },
      ],
      now,
    );
    expect(buckets).toHaveLength(30);
    expect(buckets.at(-1)).toMatchObject({ entries: 1, total: 1 });
    expect(buckets.at(-2)).toMatchObject({ offer: 1 });
    expect(buckets[0]).toMatchObject({ sales: 1 });
    expect(buckets.reduce((s, b) => s + b.total, 0)).toBe(3);
  });

  it("chat e inscrições entram numa série própria e o total é a soma do que se desenha", () => {
    const now = Date.parse("2026-10-09T10:30:20.000Z");
    const [bucket] = activityByMinute(
      [
        { name: "message_sent", occurred_at: "2026-10-09T10:30:01.000Z" },
        { name: "registered", occurred_at: "2026-10-09T10:30:02.000Z" },
        { name: "started_watching", occurred_at: "2026-10-09T10:30:03.000Z" },
      ],
      now,
      1,
    );
    expect(bucket).toMatchObject({ entries: 1, other: 2, total: 3 });
    expect(bucket!.entries + bucket!.offer + bucket!.sales + bucket!.other).toBe(bucket!.total);
  });

  it("a presença pública leva só o primeiro nome com a inicial e o sítio arredondado", () => {
    expect(publicName("  Ana Maria Costa ")).toBe("Ana C.");
    expect(publicName("rui")).toBe("rui");
    expect(publicName("eva@exemplo.com")).toBe("eva");
    expect(publicName("")).toBe("");
    expect(publicPlace({ city: "Luanda", country: "Angola", countryCode: "AO", lat: -8.8383, lon: 13.2344 })).toEqual({
      city: "Luanda",
      country: "Angola",
      countryCode: "AO",
      lat: -8.8,
      lon: 13.2,
    });
    expect(publicPlace({ city: null, country: null, countryCode: null, lat: null, lon: null }).lat).toBeNull();
  });
});

describe("análises por webinar", () => {
  it("agrupa os factos de cada webinar sem os perder nem misturar", () => {
    const facts = [
      fact({ person_id: "a", webinar_id: "w1" }),
      fact({ person_id: "b", webinar_id: "w2", webinar_title: "Outro" }),
      fact({ person_id: "c", webinar_id: "w1" }),
      fact({ person_id: "d", webinar_id: null }),
    ];
    const rows = analyticsSummary(facts, [], undefined).webinars;
    expect(rows.map((w) => [w.webinarId, w.registered])).toEqual([
      ["w1", 2],
      ["w2", 1],
    ]);
  });
});

describe("Compraram e Facturação contam os mesmos pagamentos", () => {
  it("quem assistiu noutro dia e pagou hoje conta em Compraram, como na facturação", async () => {
    const { analyticsSummary } = await import("./analytics");
    const fact = {
      participant_id: "p-hoje",
      person_id: "c1",
      webinar_id: "w1",
      joined_at: "2026-11-05T11:23:00Z",
      purchased: true,
    } as unknown as Parameters<typeof analyticsSummary>[0][number];
    const purchases = [{ contact_id: "c1", amount_value: 197, currency: "EUR", webinar_id: "w1" }];
    const a = analyticsSummary([fact], purchases, undefined);
    expect(a.summary.buyers).toBe(1);
    expect(a.payments).toBe(1);
    expect(a.webinars[0]!.buyers).toBe(1);
  });
});
