import { beforeEach, describe, expect, it, vi } from "vitest";

// O livro é simulado: só interessa o que o medidor manda gravar.
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { rpc } }));

const { meterTokens, NoCreditsError, runBilled } = await import("./billing.server");

const state = (over: Record<string, unknown> = {}) => ({
  data: {
    balance_micros: 5_000_000,
    month_spent_micros: 0,
    plan: "creator",
    plan_allowance_micros: 0,
    plan_remaining_micros: 0,
    cap_micros: null,
    ...over,
  },
  error: null,
});

beforeEach(() => {
  rpc.mockReset();
  // Por omissão a base ainda não tem a 0086: a reserva não existe e vale o caminho antigo.
  rpc.mockImplementation(async (name: string) =>
    name === "credit_state"
      ? state()
      : name === "reserve_credit"
        ? { data: null, error: { code: "PGRST202", message: "Could not find the function public.reserve_credit" } }
        : { data: 0, error: null },
  );
  // O preço geral é o do modelo em AI_CHAT_MODEL.
  process.env["AI_CHAT_MODEL"] = "m";
  process.env["AI_PRICE_INPUT_PER_MTOK"] = "0.4";
  process.env["AI_PRICE_OUTPUT_PER_MTOK"] = "1.6";
  process.env["AI_MARGIN"] = "0.5";
});

describe("modelo sem preço", () => {
  it("não é cobrado: nem zero inventado nem movimento no livro", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await runBilled({ organizationId: "org", action: "agent_reply" }, () =>
      meterTokens("modelo-sem-preco", 5000, 500),
    );
    expect(usageCalls()).toHaveLength(0);
  });
});

const usageCalls = () => rpc.mock.calls.filter(([name]) => name === "record_credit_usage");

describe("runBilled", () => {
  it("soma todas as chamadas da acção num único movimento, com a margem", async () => {
    const result = await runBilled({ organizationId: "org", action: "chat_generation" }, async () => {
      await meterTokens("m", 1000, 100); // (400 + 160) × 1,5 = 840 µ$
      await meterTokens("m", 2000, 0); // 800 × 1,5 = 1200 µ$
      return "feito";
    });
    expect(result).toBe("feito");
    expect(usageCalls()).toHaveLength(1);
    expect(usageCalls()[0]![1]).toMatchObject({
      _organization_id: "org",
      _action: "chat_generation",
      _amount_micros: 2040,
      _meta: { calls: 2, input_tokens: 3000, output_tokens: 100 },
    });
  });

  it("se a acção falhar, não cobra nada", async () => {
    await expect(
      runBilled({ organizationId: "org", action: "agent_reply" }, async () => {
        await meterTokens("m", 5000, 500);
        throw new Error("falhou a meio");
      }),
    ).rejects.toThrow("falhou a meio");
    expect(usageCalls()).toHaveLength(0);
  });

  it("uma acção dentro de outra conta uma só vez", async () => {
    await runBilled({ organizationId: "org", action: "transcription" }, async () => {
      await meterTokens("m", 1000, 0);
      await runBilled({ organizationId: "org", action: "agent_reply" }, () => meterTokens("m", 1000, 0));
    });
    expect(usageCalls()).toHaveLength(1);
    expect(usageCalls()[0]![1]).toMatchObject({ _action: "transcription", _amount_micros: 1200 });
  });

  it("sem saldo ou acima do limite não corre a acção", async () => {
    const fn = vi.fn(async () => "não devia correr");
    rpc.mockImplementation(async () => state({ balance_micros: 0 }));
    await expect(runBilled({ organizationId: "org", action: "image" }, fn)).rejects.toBeInstanceOf(NoCreditsError);
    rpc.mockImplementation(async () => state({ cap_micros: 1_000_000, month_spent_micros: 1_000_000 }));
    await expect(runBilled({ organizationId: "org", action: "image" }, fn)).rejects.toBeInstanceOf(NoCreditsError);
    expect(fn).not.toHaveBeenCalled();
  });

  it("custo já feito no fornecedor regista mesmo sem saldo", async () => {
    rpc.mockImplementation(async (name: string) =>
      name === "credit_state" ? state({ balance_micros: 0 }) : { data: 0, error: null },
    );
    await runBilled({ organizationId: "org", action: "transcription", alreadyIncurred: true }, () =>
      meterTokens("m", 1000, 0),
    );
    expect(usageCalls()).toHaveLength(1);
  });
});

describe("runBilled com a reserva atómica (0086)", () => {
  const withHolds = (reserve: unknown) =>
    rpc.mockImplementation(async (name: string) =>
      name === "reserve_credit"
        ? { data: reserve, error: null }
        : name === "settle_credit"
          ? { data: { charged_micros: 2040, uncharged_micros: 0, duplicate: false }, error: null }
          : { data: true, error: null },
    );
  const calls = (name: string) => rpc.mock.calls.filter(([n]) => n === name);

  it("reserva antes, liquida depois com o custo real, e não usa o caminho antigo", async () => {
    withHolds({ hold_id: "h1", amount_micros: 2_000_000, reason: null });
    await runBilled({ organizationId: "org", action: "chat_generation" }, async () => {
      await meterTokens("m", 1000, 100);
      await meterTokens("m", 2000, 0);
    });
    expect(calls("reserve_credit")[0]![1]).toMatchObject({ _organization_id: "org", _max_micros: 2_000_000 });
    expect(calls("settle_credit")[0]![1]).toMatchObject({ _hold_id: "h1", _amount_micros: 2040 });
    expect(calls("credit_state")).toHaveLength(0);
    expect(calls("record_credit_usage")).toHaveLength(0);
  });

  it("sem saldo livre ou no limite mensal, a acção nem corre", async () => {
    withHolds({ hold_id: null, amount_micros: 0, reason: "monthly_cap" });
    const fn = vi.fn();
    await expect(runBilled({ organizationId: "org", action: "agent_reply" }, fn)).rejects.toThrow(/limite mensal/);
    expect(fn).not.toHaveBeenCalled();
    withHolds({ hold_id: null, amount_micros: 0, reason: "no_balance" });
    await expect(runBilled({ organizationId: "org", action: "agent_reply" }, fn)).rejects.toBeInstanceOf(NoCreditsError);
  });

  it("a acção falha: a reserva é libertada e nada se cobra", async () => {
    withHolds({ hold_id: "h2", amount_micros: 50_000, reason: null });
    await expect(
      runBilled({ organizationId: "org", action: "agent_reply" }, async () => {
        await meterTokens("m", 5000, 500);
        throw new Error("falhou a meio");
      }),
    ).rejects.toThrow("falhou a meio");
    expect(calls("release_credit")[0]![1]).toMatchObject({ _hold_id: "h2", _organization_id: "org" });
    expect(calls("settle_credit")).toHaveLength(0);
  });
});
