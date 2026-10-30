import { describe, expect, it } from "vitest";
import { contactCountryOf, countryFromPhone, revenueByCountry, type ContactCountry } from "./contact-countries";

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
