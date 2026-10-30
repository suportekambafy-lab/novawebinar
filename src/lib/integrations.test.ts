import { describe, expect, it } from "vitest";

import {
  legacyPurchaseEvent,
  normalizeEvent,
  parseAmount,
  saleDateOf,
  webhookStatus,
  whatsappNumber,
  whatsappReady,
} from "./integrations";

describe("WhatsApp: número e ligação", () => {
  it("o número no formato do WhatsApp: com +, sem +, com 00 e com o indicativo já escrito", () => {
    expect(whatsappNumber("+351 912 345 678")).toBe("351912345678");
    expect(whatsappNumber("923456789")).toBe("244923456789");
    expect(whatsappNumber("923456789", "351")).toBe("351923456789");
    expect(whatsappNumber("244923456789")).toBe("244923456789");
    expect(whatsappNumber("0923456789")).toBe("244923456789");
    expect(whatsappNumber("12345")).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });

  it("só conta como ligado o não oficial com sessão e número", () => {
    const settings = { mode: "unofficial", session: "org_1", phone: "244900000001" };
    expect(whatsappReady({ provider: "whatsapp", enabled: true, settings })).toBe(true);
    expect(whatsappReady({ provider: "whatsapp", enabled: false, settings })).toBe(false);
    expect(whatsappReady({ provider: "whatsapp", enabled: true, settings: { mode: "unofficial" } })).toBe(false);
    expect(whatsappReady({ provider: "whatsapp", enabled: true, settings: { ...settings, mode: "official" } })).toBe(false);
    expect(whatsappReady(undefined)).toBe(false);
  });
});

describe("normalizeEvent", () => {
  it("Kambafy: pagamento em kwanzas, teste e reembolso", () => {
    expect(
      normalizeEvent("kambafy", {
        event: "payment.success",
        email: "Cliente@Email.com",
        name: "João Silva",
        phone: "+244923456789",
        data: {
          order_id: "L830BCVWC",
          product_id: "0b6c-uuid",
          total_price: 5000.0,
          currency: "KZ",
          product_name: "Curso",
        },
      }),
    ).toEqual({
      productId: "0b6c-uuid",
      kind: "purchase",
      eventType: "payment.success",
      status: "approved",
      email: "cliente@email.com",
      name: "João Silva",
      phone: "+244923456789",
      product: "Curso",
      amountValue: 5000,
      currency: "AOA",
      externalId: "L830BCVWC",
    });
    expect(normalizeEvent("kambafy", { event: "test.webhook" }).kind).toBe("ignore");
    const refund = normalizeEvent("kambafy", {
      event: "refund.approved",
      data: { customer_email: "a@b.ao", order_id: "X1", amount: "5.000,00" },
    });
    expect(refund.kind === "purchase" && [refund.status, refund.email, refund.amountValue]).toEqual([
      "refunded",
      "a@b.ao",
      5000,
    ]);
  });

  it("Hotmart v2", () => {
    const e = normalizeEvent("hotmart", {
      event: "PURCHASE_APPROVED",
      data: {
        product: { name: "Product Name" },
        buyer: { email: "buyer@email.com", name: "Buyer", checkout_phone: "999999999" },
        purchase: { price: { value: 150.6, currency_value: "BRL" }, transaction: "HP02316330308193" },
      },
    });
    expect(e.kind === "purchase" && [e.status, e.amountValue, e.currency, e.externalId]).toEqual([
      "approved",
      150.6,
      "BRL",
      "HP02316330308193",
    ]);
    expect(normalizeEvent("hotmart", { event: "PURCHASE_PROTEST" }).kind).toBe("ignore");
    const refused = normalizeEvent("hotmart", {
      event: "PURCHASE_CANCELED",
      data: { buyer: { email: "b@x.com" }, purchase: { transaction: "HP1" } },
    });
    expect(refused.kind === "purchase" && [refused.status, refused.externalId]).toEqual(["failed", "HP1"]);
    // O abandono de carrinho não tem transacção: fica com o id do evento.
    const cart = normalizeEvent("hotmart", {
      id: "evt-9",
      event: "PURCHASE_OUT_OF_SHOPPING_CART",
      data: { buyer: { email: "c@x.com" }, product: { id: 4774438, name: "Curso" } },
    });
    expect(cart.kind === "purchase" && [cart.status, cart.externalId, cart.productId]).toEqual([
      "abandoned",
      "cart:evt-9",
      "4774438",
    ]);
  });

  it("Kiwify: valor em cêntimos", () => {
    const e = normalizeEvent("kiwify", {
      order_id: "94e9",
      order_status: "paid",
      webhook_event_type: "order_approved",
      Product: { product_name: "Example" },
      Customer: { full_name: "John Doe", email: "john@example.com", mobile: "+62301303531" },
      Commissions: { charge_amount: 4492, currency: "BRL" },
    });
    expect(e.kind === "purchase" && [e.status, e.amountValue, e.name]).toEqual(["approved", 44.92, "John Doe"]);
    const refused = normalizeEvent("kiwify", {
      order_id: "94ea",
      order_status: "refused",
      webhook_event_type: "order_rejected",
      Customer: { email: "john@example.com" },
    });
    expect(refused.kind === "purchase" && refused.status).toBe("failed");
  });

  it("Eduzz: estado vem do evento, não de data.status", () => {
    const e = normalizeEvent("eduzz", {
      event: "myeduzz.invoice_chargeback",
      data: {
        id: "12345678",
        status: "paid",
        buyer: { name: "Alice", email: "alice@example.com", cellphone: "555" },
        paid: { currency: "BRL", value: 301.5 },
        items: [{ name: "Widget X" }],
      },
    });
    expect(e.kind === "purchase" && [e.status, e.product, e.amountValue]).toEqual(["refunded", "Widget X", 301.5]);
    expect(normalizeEvent("eduzz", { event: "ping" }).kind).toBe("ignore");
    const expired = normalizeEvent("eduzz", {
      event: "myeduzz.invoice_expired",
      data: { id: "9", buyer: { email: "a@x.com" }, items: [{ name: "W", productId: "p-77" }] },
    });
    expect(expired.kind === "purchase" && [expired.status, expired.productId]).toEqual(["abandoned", "p-77"]);
    const cart = normalizeEvent("eduzz", {
      id: "e-1",
      event: "sun.cart_abandonment",
      data: { transactionId: "t-5", lastStep: "payment-failed", customer: { email: "d@x.com" }, productId: ["p-88"] },
    });
    expect(cart.kind === "purchase" && [cart.status, cart.externalId, cart.productId]).toEqual([
      "failed",
      "t-5",
      "p-88",
    ]);
  });

  it("Stripe: cêntimos, moeda sem casas decimais e reembolso ligado pelo payment_intent", () => {
    const paid = normalizeEvent("stripe", {
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          payment_intent: "pi_1",
          payment_status: "paid",
          amount_total: 1099,
          currency: "usd",
          customer_details: { email: "x@y.com", name: "X" },
        },
      },
    });
    expect(paid.kind === "purchase" && [paid.amountValue, paid.currency, paid.externalId]).toEqual([
      10.99,
      "USD",
      "pi_1",
    ]);
    const yen = normalizeEvent("stripe", {
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", amount_total: 500, currency: "jpy", payment_intent: "pi_2" } },
    });
    expect(yen.kind === "purchase" && yen.amountValue).toBe(500);
    const refund = normalizeEvent("stripe", {
      type: "charge.refunded",
      data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 1099, amount_refunded: 1099, refunded: true, currency: "usd" } },
    });
    expect(refund.kind === "purchase" && [refund.status, refund.externalId]).toEqual(["refunded", "pi_1"]);
    // Reembolso parcial: a venda continua a contar.
    const partial = normalizeEvent("stripe", {
      type: "charge.refunded",
      data: { object: { id: "ch_1", payment_intent: "pi_1", amount: 50000, amount_refunded: 500, refunded: false, currency: "usd" } },
    });
    expect(partial.kind).toBe("ignore");
    // Disputa perdida (chargeback): desfaz a venda; ganha ou aberta: não mexe.
    const lost = normalizeEvent("stripe", {
      type: "charge.dispute.closed",
      data: { object: { id: "dp_1", payment_intent: "pi_1", amount: 1099, currency: "usd", status: "lost" } },
    });
    expect(lost.kind === "purchase" && [lost.status, lost.externalId]).toEqual(["refunded", "pi_1"]);
    const won = normalizeEvent("stripe", {
      type: "charge.dispute.closed",
      data: { object: { id: "dp_2", payment_intent: "pi_1", amount: 1099, currency: "usd", status: "won" } },
    });
    expect(won.kind).toBe("ignore");
    // As tentativas que não acabaram em compra ligam-se pelo mesmo payment_intent.
    const failed = normalizeEvent("stripe", {
      type: "payment_intent.payment_failed",
      data: { object: { id: "pi_1", amount: 1099, currency: "usd", receipt_email: "x@y.com" } },
    });
    expect(failed.kind === "purchase" && [failed.status, failed.externalId, failed.email]).toEqual([
      "failed",
      "pi_1",
      "x@y.com",
    ]);
    const expired = normalizeEvent("stripe", {
      type: "checkout.session.expired",
      data: { object: { id: "cs_9", payment_intent: null, customer_details: { email: "z@y.com" } } },
    });
    expect(expired.kind === "purchase" && [expired.status, expired.externalId]).toEqual(["abandoned", "cs_9"]);
  });

  it("Kambafy: pagamento falhado e pedido cancelado", () => {
    const failed = normalizeEvent("kambafy", { event: "payment.failed", email: "a@b.ao", data: { order_id: "L1" } });
    expect(failed.kind === "purchase" && failed.status).toBe("failed");
    const cancelled = normalizeEvent("kambafy", { event: "order.cancelled", email: "a@b.ao", data: { order_id: "L1" } });
    expect(cancelled.kind === "purchase" && cancelled.status).toBe("abandoned");
  });

  it("Outra plataforma: campos simples e estado em português", () => {
    const e = normalizeEvent("webhook", { email: "a@b.pt", amount: "97,00", status: "pago", id: "7" });
    expect(e.kind === "purchase" && [e.status, e.amountValue, e.externalId]).toEqual(["approved", 97, "7"]);
    const cancelled = normalizeEvent("webhook", { email: "a@b.pt", status: "cancelado" });
    expect(cancelled.kind === "purchase" && cancelled.status).toBe("abandoned");
    // Sem estado não é venda.
    expect(normalizeEvent("webhook", { email: "a@b.pt", id: "8" }).kind).toBe("ignore");
  });

  it("product_id liga a venda à oferta (outra plataforma e metadata do Stripe)", () => {
    const generic = normalizeEvent("webhook", { email: "a@b.pt", status: "approved", product_id: "curso-7" });
    expect(generic.kind === "purchase" && generic.productId).toBe("curso-7");
    const stripe = normalizeEvent("stripe", {
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", customer_details: { email: "a@b.pt" }, metadata: { product_id: "prod_X" } } },
    });
    expect(stripe.kind === "purchase" && stripe.productId).toBe("prod_X");
  });
});

describe("webhookStatus: nunca confundir falha com compra", () => {
  it.each([
    ["unpaid", "failed"],
    ["not_paid", "failed"],
    ["nao_pago", "failed"],
    ["não pago", "failed"],
    ["nao_aprovado", "failed"],
    ["desaprovado", "failed"],
    ["unsuccessful", "failed"],
    ["payment_failed", "failed"],
    ["recusado", "failed"],
    ["incomplete", "pending"],
    ["aguardando pagamento", "pending"],
    ["abandoned", "abandoned"],
    ["expirado", "abandoned"],
    ["approved", "approved"],
    ["pago", "approved"],
    ["refunded", "refunded"],
    ["chargeback", "refunded"],
  ])("%s → %s", (raw, status) => {
    expect(webhookStatus(raw)).toBe(status);
  });

  it.each(["", "pending_refund", "refund_requested", "chargeback_won", "desconhecido"])(
    "%s → sem estado, não conta",
    (raw) => {
      expect(webhookStatus(raw)).toBeNull();
    },
  );
});

describe("parseAmount", () => {
  it("aceita formatos comuns", () => {
    expect([parseAmount("5.000,00"), parseAmount("5000.00"), parseAmount("Kz 1 500"), parseAmount("")]).toEqual([
      5000, 5000, 1500, null,
    ]);
  });

  it.each([
    ["1,500.00", 1500],
    ["15,000", 15000],
    ["1.500,00", 1500],
    ["1500", 1500],
    ["Kz 1,500.00", 1500],
    ["197,5", 197.5],
    ["197.5", 197.5],
    ["1.234.567", 1234567],
    [97, 97],
  ])("%s → %s: o último separador decide", (raw, expected) => {
    expect(parseAmount(raw)).toBe(expected);
  });

  it("sem número, nada", () => {
    expect([parseAmount("abc"), parseAmount(null), parseAmount(Number.NaN)]).toEqual([null, null, null]);
  });
});

describe("endereço antigo de compras: o estado", () => {
  const base = { buyer_email: "a@b.pt", buyer_name: "Ana", amount: "100", order_id: "o1" };
  it("sem estado é compra feita; aprovado, pendente, falhado e reembolsado lêem-se", () => {
    const status = (s?: string) => {
      const { event } = legacyPurchaseEvent(s === undefined ? base : { ...base, status: s });
      return event.kind === "purchase" ? event.status : event.kind;
    };
    expect(status()).toBe("approved");
    expect(status("approved")).toBe("approved");
    expect(status("waiting_payment")).toBe("pending");
    expect(status("refused")).toBe("failed");
    expect(status("chargeback")).toBe("refunded");
  });
  it("cancelado, expirado, abandonado ou um estado desconhecido nunca contam como venda", () => {
    for (const s of ["cancelled", "canceled", "expired", "abandoned", "declined", "xpto"]) {
      const { event } = legacyPurchaseEvent({ ...base, status: s });
      expect(event.kind === "purchase" ? event.status : "ignore").not.toBe("approved");
    }
  });
});

describe("data da venda escrita no pedido (envios atrasados ou à mão)", () => {
  const now = Date.parse("2026-10-30T09:21:00Z");

  it("lê ISO, segundos e milissegundos, na raiz ou em data", () => {
    expect(saleDateOf({ paid_at: "2026-10-29T22:15:00Z" }, now)).toBe("2026-10-29T22:15:00.000Z");
    expect(saleDateOf({ data: { paid_at: Date.parse("2026-10-29T22:15:00Z") / 1000 } }, now)).toBe("2026-10-29T22:15:00.000Z");
    expect(saleDateOf({ data: { purchase: { approved_date: Date.parse("2026-10-29T22:15:00Z") } } }, now)).toBe(
      "2026-10-29T22:15:00.000Z",
    );
    expect(saleDateOf({ created_at: String(Date.parse("2026-10-29T22:15:00Z") / 1000) }, now)).toBe(
      "2026-10-29T22:15:00.000Z",
    );
  });

  it("ignora datas impossíveis: no futuro, de há mais de 90 dias ou ilegíveis", () => {
    expect(saleDateOf({ paid_at: "2026-10-31T09:00:00Z" }, now)).toBeUndefined();
    expect(saleDateOf({ paid_at: "2026-01-01T00:00:00Z" }, now)).toBeUndefined();
    expect(saleDateOf({ paid_at: "ontem" }, now)).toBeUndefined();
    expect(saleDateOf({}, now)).toBeUndefined();
  });

  it("a venda do webhook genérico e do endereço antigo leva a data; sem ela, não leva", () => {
    const iso = new Date(Date.now() - 3_600_000).toISOString();
    const sale = normalizeEvent("webhook", { email: "a@b.pt", status: "approved", paid_at: iso });
    expect(sale).toMatchObject({ kind: "purchase", occurredAt: iso });
    expect(normalizeEvent("webhook", { email: "a@b.pt", status: "approved" })).not.toHaveProperty("occurredAt");
    expect(legacyPurchaseEvent({ buyer_email: "a@b.pt", buyer_name: "A", paid_at: iso }).event).toMatchObject({
      occurredAt: iso,
    });
  });
});
