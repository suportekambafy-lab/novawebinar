import { beforeEach, describe, expect, it, vi } from "vitest";

/** Uma base falsa: cada tabela devolve as linhas guardadas, filtradas pelos .eq/.in/.ilike pedidos. */
const tables: Record<string, Record<string, unknown>[]> = {};
function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  let max = Infinity;
  const chain = {
    then: (resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) =>
      resolve({ data: rows.slice(0, max), error: null }),
    select: () => chain,
    eq: (col: string, value: unknown) => ((rows = rows.filter((r) => r[col] === value)), chain),
    in: (col: string, values: unknown[]) => ((rows = rows.filter((r) => values.includes(r[col]))), chain),
    ilike: (col: string, value: string) => (
      (rows = rows.filter((r) => String(r[col] ?? "").toLowerCase() === value.replace(/\\/g, "").toLowerCase())), chain
    ),
    order: () => chain,
    limit: (n: number) => ((max = n), chain),
  };
  return chain;
}
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: (t: string) => query(t) } }));

const { rememberedVariant } = await import("./assign.server");

const test = {
  id: "t1",
  variants: [
    { id: "va", webinar_id: "wa" },
    { id: "vb", webinar_id: "wb" },
  ],
};

describe("rememberedVariant: o lead volta à variante que já viu", () => {
  beforeEach(() => {
    for (const key of Object.keys(tables)) delete tables[key];
  });

  it("pela atribuição com o e-mail dele", async () => {
    tables["ab_test_assignments"] = [{ ab_test_id: "t1", email: "ana@x.pt", variant_id: "vb" }];
    expect((await rememberedVariant(test, { email: "Ana@X.pt" }))?.id).toBe("vb");
  });

  it("pela inscrição num dos webinars do teste, quando a atribuição não tem e-mail", async () => {
    tables["participants"] = [{ webinar_id: "wb", email: "rui@x.pt", phone: null }];
    expect((await rememberedVariant(test, { email: "rui@x.pt" }))?.id).toBe("vb");
  });

  it("só com o WhatsApp", async () => {
    tables["participants"] = [{ webinar_id: "wa", email: null, phone: "+244923456789" }];
    expect((await rememberedVariant(test, { phone: "+244923456789" }))?.id).toBe("va");
  });

  it("sem registo, ou com o e-mail da sala de teste: nenhuma (fica a do tráfego)", async () => {
    tables["participants"] = [{ webinar_id: "wb", email: "teste-1@sala.local", phone: null }];
    expect(await rememberedVariant(test, { email: "novo@x.pt" })).toBeNull();
    expect(await rememberedVariant(test, { email: "teste-1@sala.local" })).toBeNull();
    expect(await rememberedVariant(test, {})).toBeNull();
  });

  it("uma inscrição noutro webinar fora do teste não conta", async () => {
    tables["participants"] = [{ webinar_id: "outro", email: "ana@x.pt", phone: null }];
    expect(await rememberedVariant(test, { email: "ana@x.pt" })).toBeNull();
  });
});
