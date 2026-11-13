import { describe, expect, it } from "vitest";
import { buildSales, matchesSale, salesSummary, type ContactRow, type FactRow, type PurchaseRow } from "./sales";

const purchase = (over: Partial<PurchaseRow>): PurchaseRow => ({
  id: "p1",
  contact_id: "c1",
  webinar_id: "w1",
  buyer_name: "Comprador",
  buyer_email: "a@x.pt",
  product_name: "Turma Vende+",
  amount_value: 197,
  currency: "EUR",
  status: "approved",
  provider: "kambafy",
  approved_at: "2026-11-05T12:30:00Z",
  status_at: "2026-11-05T12:30:00Z",
  created_at: "2026-11-05T12:30:00Z",
  ...over,
});
const fact = (over: Partial<FactRow>): FactRow => ({
  contact_id: "c1",
  webinar_id: "w1",
  joined_at: "2026-11-05T11:00:00Z",
  attended: true,
  actual_watch_seconds: 1800,
  duration_seconds: 3600,
  viewing_mode: "live",
  clicked: true,
  device: "mobile",
  ...over,
});
const contact: ContactRow = { id: "c1", name: "Marta Sousa", email: "marta@x.pt", phone: null, country_code: "FR", country: "França", first_source: "facebook", first_campaign: "outubro" };
const titles = new Map([["w1", "Marca Milionária"], ["w2", "Leilões"]]);

describe("buildSales", () => {
  it("junta quem comprou, o país pelo IP, o webinar e o tempo que assistiu", () => {
    const [s] = buildSales([purchase({})], [fact({}), fact({ viewing_mode: "replay", actual_watch_seconds: 600, joined_at: "2026-11-05T11:20:00Z" })], [contact], titles);
    expect(s).toMatchObject({
      name: "Marta Sousa",
      country: { code: "FR", label: "França" },
      webinarTitle: "Marca Milionária",
      watched: 1800,
      watchedPct: 50,
      mode: "ambos",
      clicked: true,
      source: "facebook",
      afterJoin: 5400,
    });
  });

  it("sem webinar na compra, só liga a participação se a pessoa esteve num único webinar", () => {
    const one = buildSales([purchase({ webinar_id: null })], [fact({})], [contact], titles)[0]!;
    expect(one.webinarTitle).toBe("Marca Milionária");
    const two = buildSales([purchase({ webinar_id: null })], [fact({}), fact({ webinar_id: "w2" })], [contact], titles)[0]!;
    expect(two).toMatchObject({ webinarTitle: null, watched: null });
  });

  it("quem pagou com outro e-mail fica sem país nem tempo, com o nome da compra", () => {
    const [s] = buildSales([purchase({ contact_id: null, buyer_name: "Rui" })], [], [], titles);
    expect(s).toMatchObject({ name: "Rui", country: null, watched: null });
  });

  it("os totais contam só as aprovadas, com compradores diferentes", () => {
    const sales = buildSales(
      [purchase({ id: "a" }), purchase({ id: "b" }), purchase({ id: "c", status: "failed", approved_at: null })],
      [fact({})],
      [contact],
      titles,
    );
    expect(salesSummary(sales)).toMatchObject({ payments: 2, buyers: 1, revenue: [{ currency: "EUR", amount: 394 }], averageWatch: 1800 });
    expect(matchesSale(sales[0]!, "frança")).toBe(true);
    expect(matchesSale(sales[0]!, "leilões")).toBe(false);
  });
});
