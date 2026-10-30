import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  contactCountryOf,
  countryFromPhone,
  countryRowsOf,
  revenueByCountry,
  summaryCountry,
  type ContactCountry,
} from "./contact-countries";
import type { ContactSummary } from "./contacts";
import { filterContacts } from "./contacts-journey";
import { PHONE_COUNTRIES } from "./phone-countries";

describe("countryFromPhone", () => {
  it("lê o indicativo de números internacionais", () => {
    expect(countryFromPhone("+244 923 000 101")).toBe("AO");
    expect(countryFromPhone("00351912000303")).toBe("PT");
    expect(countryFromPhone("+55 11 91234 5678")).toBe("BR");
  });

  it("não adivinha sem indicativo nem com números curtos", () => {
    expect(countryFromPhone("923000101")).toBeNull();
    expect(countryFromPhone("+2449")).toBeNull();
    expect(countryFromPhone(null)).toBeNull();
  });
});

describe("contactCountryOf", () => {
  it("a inscrição mais recente com país manda, mesmo com telefone de outro país", () => {
    const c = contactCountryOf(
      [
        { country: null, country_code: null },
        { country: "Portugal", country_code: "PT" },
      ],
      "+244923000101",
    );
    expect(c).toMatchObject({ code: "PT", label: "Portugal", from: "ip" });
  });

  it("ignora o código «XX» (país desconhecido) como a vista", () => {
    expect(contactCountryOf([{ country: "Brasil", country_code: "XX" }], null)).toBeNull();
  });

  it("sem inscrição com país, usa o telefone", () => {
    expect(contactCountryOf([], "+244923000101")).toMatchObject({ code: "AO", from: "phone" });
    expect(contactCountryOf([], null)).toBeNull();
  });
});

describe("revenueByCountry", () => {
  const ao: ContactCountry = { code: "AO", label: "Angola", flag: "🇦🇴", from: "ip" };
  const pt: ContactCountry = { code: "PT", label: "Portugal", flag: "🇵🇹", from: "ip" };
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
  it("tem os mesmos indicativos que o campo de telefone (o primeiro país de cada indicativo)", () => {
    const sql = readFileSync("drizzle/migrations/0089_contact_country.sql", "utf8");
    const inSql = [...sql.matchAll(/\('(\d+)', '([A-Z]{2})'\)/g)].map((m) => `${m[1]}:${m[2]}`).sort();
    const first = new Map<string, string>();
    for (const c of PHONE_COUNTRIES) if (!first.has(c.dial)) first.set(c.dial, c.code);
    expect(inSql).toEqual([...first].map(([dial, code]) => `${dial.slice(1)}:${code}`).sort());
  });
});

describe("país vindo da vista", () => {
  const row = (id: string, country_code: string | null | undefined, purchases = 0) =>
    ({ id, name: id, stage: purchases ? "customer" : "new", purchases, country_code }) as ContactSummary;

  it("sem a migração não há país na vista (undefined), com ela null é «sem país»", () => {
    expect(summaryCountry({})).toBeUndefined();
    expect(summaryCountry({ country_code: null })).toBeNull();
    expect(summaryCountry({ country_code: "AO", country_from: "phone" })).toMatchObject({ label: "Angola", from: "phone" });
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
