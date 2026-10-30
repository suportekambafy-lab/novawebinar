import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  contactCountryOf,
  countryRowsOf,
  revenueByCountry,
  summaryCountry,
  type ContactCountry,
} from "./contact-countries";
import type { ContactSummary } from "./contacts";
import { filterContacts } from "./contacts-journey";

describe("contactCountryOf", () => {
  it("a inscrição mais recente com país manda", () => {
    const c = contactCountryOf([
      { country: null, country_code: null },
      { country: "França", country_code: "FR" },
      { country: "Portugal", country_code: "PT" },
    ]);
    expect(c).toMatchObject({ code: "FR", label: "França" });
  });

  it("ignora o código «XX» (país desconhecido) como a vista", () => {
    expect(contactCountryOf([{ country: "Brasil", country_code: "XX" }])).toBeNull();
  });

  it("sem inscrição com país, fica sem país (o telefone não conta)", () => {
    expect(contactCountryOf([])).toBeNull();
  });
});

describe("revenueByCountry", () => {
  const ao: ContactCountry = { code: "AO", label: "Angola", flag: "🇦🇴" };
  const pt: ContactCountry = { code: "PT", label: "Portugal", flag: "🇵🇹" };
  const countries = new Map([
    ["a", ao],
    ["b", ao],
    ["c", pt],
  ]);

  it("soma por país e moeda, conta compradores uma vez e deixa os desconhecidos no fim", () => {
    const rows = revenueByCountry(
      [
        { contact_id: null, amount_value: 10, currency: "EUR" },
        { contact_id: "c", amount_value: 50, currency: "EUR" },
        { contact_id: "a", amount_value: 100, currency: "AOA" },
        { contact_id: "a", amount_value: 200, currency: "AOA" },
        { contact_id: "b", amount_value: 300, currency: "AOA" },
      ],
      countries,
    );
    expect(rows.map((r) => r.label)).toEqual(["Angola", "Portugal", "Origem desconhecida"]);
    expect(rows[0]).toMatchObject({ buyers: 2, payments: 3, revenue: [{ currency: "AOA", amount: 600 }] });
    expect(rows[2]).toMatchObject({ code: null, buyers: 1, revenue: [{ currency: "EUR", amount: 10 }] });
  });
});

describe("migração 0089", () => {
  it("não deduz o país pelo telefone: há quem viva noutro país com número de Portugal", () => {
    const sql = readFileSync("drizzle/migrations/0089_contact_country.sql", "utf8");
    expect(sql).not.toMatch(/country_from_phone|dial/);
  });
});

describe("país vindo da vista", () => {
  const row = (id: string, country_code: string | null | undefined, purchases = 0) =>
    ({ id, name: id, stage: purchases ? "customer" : "new", purchases, country_code }) as ContactSummary;

  it("sem a migração não há país na vista (undefined), com ela null é «sem país»", () => {
    expect(summaryCountry({})).toBeUndefined();
    expect(summaryCountry({ country_code: null })).toBeNull();
    expect(summaryCountry({ country_code: "AO" })).toMatchObject({ label: "Angola", flag: "🇦🇴" });
  });

  it("conta por país como contact_country_breakdown e filtra a lista local", () => {
    const rows = [row("a", "AO", 1), row("b", "AO"), row("c", "PT"), row("d", null)];
    const counts = countryRowsOf(rows)!;
    expect(counts.map((r) => [r.country_code, r.contacts, r.customers])).toEqual([
      ["AO", 2, 1],
      ["PT", 1, 0],
      [null, 1, 0],
    ]);
    expect(counts[0]!.stages).toMatchObject({ all: 2, customer: 1, new: 1 });
    expect(filterContacts(rows, { stage: null, search: "", country: "AO" }).map((c) => c.id)).toEqual(["a", "b"]);
    expect(countryRowsOf([row("x", undefined)])).toBeNull();
  });
});
