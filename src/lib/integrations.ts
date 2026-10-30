/**
 * Integrações: catálogo (o que cada uma faz e como se liga) e tradução do
 * formato de cada plataforma de vendas para uma venda única, ligada ao contacto.
 */

export type ProviderId =
  | "kambafy"
  | "hotmart"
  | "kiwify"
  | "eduzz"
  | "stripe"
  | "webhook"
  | "meta_pixel"
  | "tiktok_pixel"
  | "google_tag"
  | "outgoing_webhook";

export type IntegrationGroup = "sales" | "ads" | "send";

export type ProviderInfo = {
  id: ProviderId;
  name: string;
  group: IntegrationGroup;
  blurb: string;
  /** Segredo da plataforma: o browser escreve-o, nunca o lê de volta. */
  secret?: { label: string; help: string; required: boolean; generate?: boolean };
  /** Valor visível (id do pixel, endereço de saída). */
  setting?: { key: "pixel_id" | "tag_id" | "url"; label: string; placeholder: string; pattern: RegExp };
  /** Onde a pessoa se liga na plataforma (ex.: "Pagamentos"). */
  category: string;
  /** Painel da plataforma, quando o endereço é estável. */
  dashboardUrl?: string;
  /** Guia de ligação; um passo pode mostrar o endereço, o segredo ou o id no sítio certo. */
  steps: (string | { text: string; show: "url" | "secret" | "setting" })[];
};

export const PROVIDERS: ProviderInfo[] = [
  {
    id: "kambafy",
    name: "Kambafy",
    group: "sales",
    category: "Pagamentos",
    blurb: "Pagamentos em kwanzas e outras moedas; cada venda liga-se ao webinar cuja oferta aponta para o produto.",
    secret: {
      label: "Segredo do webhook",
      help: "Gerado aqui. Por segurança só é mostrado quando o gera.",
      required: true,
      generate: true,
    },
    dashboardUrl: "https://kambafy.com",
    steps: [
      "Na Kambafy, abra o produto que vende no webinar e entre em Integrações › Webhook.",
      { text: "Cole este endereço no campo URL.", show: "url" },
      { text: "Cole este segredo no campo Secret.", show: "secret" },
      "Marque payment.success, order.completed, payment.failed e order.cancelled. Dois eventos da mesma venda contam uma vez.",
      "Carregue em Testar: o teste aparece em Actividade. Repita para cada produto dos seus webinars.",
      "No webinar, use o link de checkout do produto (pay.kambafy.com/checkout/…) no botão da oferta: é assim que a venda fica ligada ao webinar certo.",
    ],
  },
  {
    id: "hotmart",
    name: "Hotmart",
    group: "sales",
    category: "Pagamentos",
    blurb: "Compras, pagamentos recusados, boletos expirados, carrinhos abandonados e reembolsos.",
    secret: {
      label: "Hottok",
      help: "Está na página de Webhook da Hotmart (API e notificações).",
      required: true,
    },
    steps: [
      "Na Hotmart, vá a Ferramentas › Webhook (API e notificações) › Cadastrar webhook.",
      { text: "Escolha o produto, use a versão 2.0.0 e cole este endereço.", show: "url" },
      "Marque compra aprovada, cancelada, expirada, reembolsada, chargeback e abandono de carrinho.",
      { text: "Copie o Hottok da Hotmart e cole-o aqui.", show: "secret" },
    ],
  },
  {
    id: "kiwify",
    name: "Kiwify",
    group: "sales",
    category: "Pagamentos",
    blurb: "Vendas pagas, compras recusadas, boletos e pix pendentes, reembolsos e chargebacks.",
    secret: {
      label: "Token do webhook",
      help: "Aparece na Kiwify ao criar o webhook.",
      required: true,
    },
    steps: [
      "Na Kiwify, vá a Apps › Webhooks e crie um webhook.",
      { text: "Cole este endereço e escolha os produtos.", show: "url" },
      "Marque compra aprovada, compra recusada, boleto gerado, pix gerado, reembolso e chargeback.",
      { text: "Copie o token do webhook e cole-o aqui.", show: "secret" },
    ],
  },
  {
    id: "eduzz",
    name: "Eduzz",
    group: "sales",
    category: "Pagamentos",
    blurb: "Faturas pagas, canceladas, expiradas e em recuperação, abandonos de carrinho e reembolsos.",
    secret: {
      label: "Chave de acesso",
      help: "Gerada na Eduzz em Console › Webhook › Segurança.",
      required: true,
    },
    steps: [
      "Na Eduzz, abra Console › Webhook › Segurança e gere uma chave.",
      { text: "Crie uma configuração com este endereço e essa chave.", show: "url" },
      "Marque fatura paga, cancelada, expirada, em recuperação, reembolsada, chargeback e abandono de carrinho, e active a configuração.",
      { text: "Cole aqui a mesma chave. O teste da Eduzz aparece em Actividade.", show: "secret" },
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    group: "sales",
    category: "Pagamentos",
    blurb: "Pagamentos do Checkout e dos Payment Links, pagamentos falhados, sessões expiradas e reembolsos.",
    secret: {
      label: "Signing secret",
      help: "Começa por whsec_. Está no endpoint, em Revelar.",
      required: true,
    },
    dashboardUrl: "https://dashboard.stripe.com/webhooks",
    steps: [
      { text: "No Stripe, vá a Webhooks e adicione um endpoint com este endereço.", show: "url" },
      "Escolha checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, checkout.session.expired, payment_intent.payment_failed e charge.refunded.",
      { text: "Revele o signing secret (whsec_…) e cole-o aqui.", show: "secret" },
    ],
  },
  {
    id: "webhook",
    name: "Outra plataforma",
    group: "sales",
    category: "Qualquer sistema",
    blurb: "Qualquer sistema que envie um POST em JSON com o email de quem comprou.",
    secret: {
      label: "Segredo",
      help: "Os pedidos têm de trazer o cabeçalho X-Webhook-Secret com este valor.",
      required: true,
      generate: true,
    },
    steps: [
      { text: "Envie um POST em JSON para este endereço.", show: "url" },
      'Campos: email, name, phone, product, product_id, amount, currency, status ("approved", "pending", "failed", "abandoned" ou "refunded") e id. O id é o do pagamento: o mesmo id em estados seguintes actualiza a venda; um pedido repetido conta uma vez.',
      'Ao enviar vendas antigas ou à mão, junte paid_at com a data do pagamento (ex.: "2026-10-29T22:15:00Z"). Sem ele, a venda conta no dia em que chegou.',
      "Com product_id presente no link do botão da oferta, a venda fica ligada a esse webinar.",
      { text: "Envie este segredo no cabeçalho X-Webhook-Secret.", show: "secret" },
    ],
  },
  {
    id: "meta_pixel",
    name: "Meta Pixel",
    group: "ads",
    category: "Facebook e Instagram",
    blurb: "Visita da sala, inscrição (Lead) e clique na oferta (InitiateCheckout).",
    setting: {
      key: "pixel_id",
      label: "ID do pixel",
      placeholder: "123456789012345",
      pattern: /^\d{10,20}$/,
    },
    dashboardUrl: "https://business.facebook.com/events_manager2",
    steps: [
      "No Gestor de Eventos da Meta, abra o seu pixel (conjunto de dados).",
      { text: "Copie o ID (só números) e cole-o aqui.", show: "setting" },
    ],
  },
  {
    id: "tiktok_pixel",
    name: "TikTok Pixel",
    group: "ads",
    category: "TikTok Ads",
    blurb: "Visita, inscrição (CompleteRegistration) e clique na oferta (InitiateCheckout).",
    setting: {
      key: "pixel_id",
      label: "ID do pixel",
      placeholder: "C0ABCDEFGHIJ1234567",
      pattern: /^[A-Z0-9]{15,25}$/,
    },
    steps: [
      "No TikTok Ads Manager, abra Ferramentas › Eventos › Eventos web.",
      { text: "Copie o ID do pixel e cole-o aqui.", show: "setting" },
    ],
  },
  {
    id: "google_tag",
    name: "Google Ads e Analytics",
    group: "ads",
    category: "Google",
    blurb: "Inscrições (generate_lead) e cliques na oferta (begin_checkout) na etiqueta do Google.",
    setting: {
      key: "tag_id",
      label: "ID da etiqueta",
      placeholder: "AW-123456789 ou G-ABC123",
      pattern: /^(AW|G)-[A-Z0-9]{6,15}$/,
    },
    dashboardUrl: "https://ads.google.com",
    steps: [
      "No Google Ads (Ferramentas › Etiqueta do Google) ou no GA4 (Fluxos de dados), encontre o ID.",
      { text: "Cole-o aqui: começa por AW- ou por G-.", show: "setting" },
    ],
  },
  {
    id: "outgoing_webhook",
    name: "Webhook de saída",
    group: "send",
    category: "Zapier, Make, n8n, CRM",
    blurb: "Inscrições, cliques na oferta e vendas enviados em tempo real, com assinatura.",
    setting: {
      key: "url",
      label: "Endereço de destino",
      placeholder: "https://hooks.zapier.com/…",
      pattern: /^https:\/\/\S+$/,
    },
    secret: {
      label: "Chave de assinatura",
      help: "Cada envio leva o cabeçalho X-Signature: HMAC-SHA256 do corpo com esta chave.",
      required: true,
      generate: true,
    },
    steps: [
      { text: "Cole o endereço do Zapier, do Make, do n8n ou do seu CRM.", show: "setting" },
      "Eventos enviados: contact.registered, offer.clicked, purchase.pending, payment.failed, checkout.abandoned, purchase.approved, purchase.refunded e automation.run (as suas Automações).",
      { text: "Para confirmar que o pedido vem de nós, valide o X-Signature com esta chave.", show: "secret" },
    ],
  },
];

export function providerInfo(id: string) {
  return PROVIDERS.find((p) => p.id === id);
}

/**
 * O WhatsApp envia pelas automações quando o número não oficial (WAHA) já foi ligado pelo
 * código QR. A ligação oficial fica guardada, mas só envia com modelos aprovados pela Meta.
 */
export function whatsappReady(
  row: { provider: string; enabled: boolean; settings: unknown } | undefined,
): boolean {
  const s = (row?.settings ?? {}) as Record<string, unknown>;
  return Boolean(
    row?.provider === "whatsapp" &&
    row.enabled &&
    s["mode"] === "unofficial" &&
    s["session"] &&
    s["phone"],
  );
}

/** Indicativo para os números guardados sem "+": Angola, salvo outro na ligação. */
export const DEFAULT_COUNTRY_CODE = "244";

/**
 * O número no formato do WhatsApp (só dígitos, com indicativo). Com "+" já é internacional;
 * sem ele, um número que já começa pelo indicativo e é mais longo do que um nacional fica
 * como está, e os outros levam o indicativo da ligação.
 * ponytail: um número nacional brasileiro com DDD igual ao indicativo (ex.: DDD 55 com 55)
 * passa por internacional; pedir o país no formulário de inscrição resolve de vez.
 */
export function whatsappNumber(
  phone: string | null | undefined,
  countryCode = DEFAULT_COUNTRY_CODE,
): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  if ((phone ?? "").trim().startsWith("+")) return digits;
  const local = digits.replace(/^0+/, "");
  return local.startsWith(countryCode) && local.length > 9 ? local : `${countryCode}${local}`;
}

/** Segredo aleatório para as integrações onde somos nós a gerá-lo. */
export function generateSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- Tradução das notificações de venda ---------- */

/**
 * Estado de um pagamento na plataforma. Iniciar o pagamento (pending) não é comprar;
 * failed e abandoned são tentativas que não acabaram em compra.
 */
export type PaymentStatus = "pending" | "failed" | "abandoned" | "approved" | "refunded";

export type NormalizedEvent =
  | {
      kind: "purchase";
      eventType: string;
      status: PaymentStatus;
      email: string | null;
      name: string;
      phone: string | null;
      product: string;
      amountValue: number | null;
      currency: string | null;
      externalId: string | null;
      /** Id do produto na plataforma: liga a venda ao webinar cuja oferta aponta para ele. */
      productId?: string | null;
      /** Quando a venda aconteceu, se o pedido o diz (envios atrasados ou feitos à mão). Sem isto, vale a chegada. */
      occurredAt?: string | undefined;
    }
  | { kind: "ignore"; eventType: string; reason: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Body = any;

function pick(body: Body, ...paths: string[]): unknown {
  for (const path of paths) {
    let value: unknown = body;
    for (const key of path.split(".")) {
      value = value !== null && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
    }
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

const text = (value: unknown) => (value === undefined || value === null ? "" : String(value).trim());

/**
 * "5000.00", "5.000,00", "1,500.00", "15,000", 97 → número; o resto → null.
 * O separador decimal é o último que aparece, e só se vier seguido de 1 ou 2 dígitos
 * (o resto são milhares): "1,500.00" → 1500; "15,000" → 15000; "197,5" → 197.5.
 */
export function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = text(value).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  const last = Math.max(s.lastIndexOf(","), s.lastIndexOf("."));
  const digitsAfter = last >= 0 ? s.length - last - 1 : 0;
  const decimal = last >= 0 && digitsAfter > 0 && digitsAfter <= 2;
  const integer = (decimal ? s.slice(0, last) : s).replace(/[.,]/g, "");
  const n = Number(decimal ? `${integer}.${s.slice(last + 1)}` : integer);
  return Number.isFinite(n) ? n : null;
}

const ZERO_DECIMAL = new Set(
  "bif clp djf gnf jpy kmf krw mga pyg rwf ugx vnd vuv xaf xof xpf".split(" "),
);

function currencyCode(value: unknown) {
  const code = text(value).toUpperCase();
  if (!code) return null;
  return code === "KZ" || code === "KZS" ? "AOA" : code;
}

function purchase(
  eventType: string,
  status: PaymentStatus,
  fields: Omit<Extract<NormalizedEvent, { kind: "purchase" }>, "kind" | "eventType" | "status">,
): NormalizedEvent {
  const email = fields.email?.toLowerCase().trim() || null;
  return { kind: "purchase", eventType, status, ...fields, email };
}

const ignore = (eventType: string, reason: string): NormalizedEvent => ({ kind: "ignore", eventType, reason });

/** Id próprio quando a plataforma não dá transacção (ex.: abandono de carrinho). */
const prefixed = (prefix: string, id: unknown) => (text(id) ? `${prefix}:${text(id)}` : null);

function statusFrom(map: Record<string, PaymentStatus>, key: string): PaymentStatus | null {
  return map[key] ?? null;
}

const words = (raw: string) =>
  raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);

/**
 * Estado dito por outra plataforma, por palavra inteira e com as palavras de falha
 * primeiro: "unpaid", "nao_pago" e "incomplete" nunca passam por compra. Sem estado,
 * ou com um estado intermédio (reembolso pedido, chargeback ganho), devolve null.
 */
export function webhookStatus(raw: string): PaymentStatus | null {
  const w = words(raw);
  const has = (...list: string[]) => list.some((word) => w.includes(word));
  const phrase = ` ${w.join(" ")} `;
  const refund = has("refund", "refunded", "reembolso", "reembolsado", "reembolsada", "chargeback", "estorno", "estornado", "estornada");
  if (refund && has("pending", "requested", "request", "waiting", "won", "pedido", "solicitado", "ganho")) return null;
  if (refund) return "refunded";
  if (
    has("unpaid", "failed", "failure", "fail", "declined", "refused", "rejected", "denied", "unsuccessful", "falhou", "falhado", "falhada", "recusado", "recusada", "negado", "negada", "desaprovado", "desaprovada") ||
    /\s(not|nao)\s(paid|pago|paga|approved|aprovado|aprovada)\s/.test(phrase)
  )
    return "failed";
  if (has("abandoned", "abandonado", "abandonada", "abandono", "expired", "expirado", "expirada", "canceled", "cancelled", "cancelado", "cancelada"))
    return "abandoned";
  if (has("pending", "waiting", "aguardando", "pendente", "processing", "incomplete", "created", "criado", "criada"))
    return "pending";
  if (has("approved", "aprovado", "aprovada", "paid", "pago", "paga", "success", "succeeded", "complete", "completed", "concluido", "concluida"))
    return "approved";
  return null;
}

/**
 * O que chega ao endereço antigo (/api/public/purchase-webhook). A Kambafy manda lá o seu formato
 * (`event` + `data`, comprador na raiz e dentro de `data`): lê-se como no receptor da Kambafy. O formato
 * antigo (buyer_name, buyer_email, amount) e as variações (name/email/phone na raiz ou em `data`) lêem-se
 * com os mesmos atalhos. `missing`: o que faltou para ser uma venda, para a resposta dizer o que falta.
 */
export function legacyPurchaseEvent(body: Body): { event: NormalizedEvent; missing: string[] } {
  if (text(pick(body, "event"))) {
    const event = normalizeEvent("kambafy", body);
    return { event, missing: event.kind === "purchase" && !event.email ? ["email"] : [] };
  }
  const email = text(pick(body, "buyer_email", "email", "data.customer_email", "data.email", "customer.email")) || null;
  const name = text(pick(body, "buyer_name", "name", "data.customer_name", "data.name", "customer.name"));
  const missing = [...(!email ? ["email"] : []), ...(!name ? ["name"] : [])];
  const rawStatus = text(pick(body, "status", "data.status")).toLowerCase();
  // Sem estado nenhum, o formato antigo era «compra feita». Com um estado, lê-se como nos outros
  // receptores: «cancelled», «expired», «declined» ou um estado desconhecido nunca contam como venda.
  const status: PaymentStatus | null = rawStatus ? webhookStatus(rawStatus.replace(/_/g, " ")) : "approved";
  if (!status) return { event: ignore(text(pick(body, "event_type", "type")) || "purchase", `Estado «${rawStatus}» sem significado de venda: ignorado.`), missing: [] };
  const occurredAt = saleDateOf(body);
  return {
    event: purchase(text(pick(body, "event_type", "type")) || "purchase", status, {
      email,
      name: name || email || "",
      phone: text(pick(body, "buyer_phone", "phone", "data.customer_phone", "data.phone", "customer.phone")) || null,
      product: text(pick(body, "product_name", "data.product_name", "product")),
      amountValue: parseAmount(pick(body, "amount", "data.amount", "data.total", "data.total_price", "data.price", "total", "price")),
      currency: currencyCode(pick(body, "currency", "data.currency")),
      externalId: text(pick(body, "id", "order_id", "transaction_id", "data.order_id", "data.transaction_id")) || null,
      productId: text(pick(body, "product_id", "data.product_id")) || null,
      ...(occurredAt ? { occurredAt } : {}),
    }),
    missing,
  };
}

/** Onde as plataformas põem a data do pagamento (a primeira que existir). */
const SALE_DATE_PATHS = [
  "paid_at",
  "approved_at",
  "purchased_at",
  "purchase_date",
  "sale_date",
  "approved_date",
  "data.paid_at",
  "data.approved_at",
  "data.purchased_at",
  "data.purchase_date",
  "data.purchase.approved_date",
  "data.created_at",
  "data.object.created",
  "order_date",
  "created_at",
  "date",
];

/**
 * A data da venda escrita no pedido: ISO, ou segundos/milissegundos desde 1970. Só conta se for
 * plausível (até 10 minutos no futuro, por relógios desacertados, e até 90 dias para trás).
 */
export function saleDateOf(body: Body, now = Date.now()): string | undefined {
  const value = pick(body, ...SALE_DATE_PATHS);
  if (value === undefined) return undefined;
  const n = typeof value === "number" ? value : /^\d{9,13}$/.test(text(value)) ? Number(text(value)) : null;
  const at = n !== null ? (n < 1e12 ? n * 1000 : n) : Date.parse(text(value));
  if (!Number.isFinite(at) || at > now + 10 * 60_000 || at < now - 90 * 86_400_000) return undefined;
  return new Date(at).toISOString();
}

/** O pedido de uma plataforma lido como venda, com a data da venda quando ele a traz. */
export function normalizeEvent(provider: ProviderId, body: Body): NormalizedEvent {
  const event = normalizeEventFields(provider, body);
  if (event.kind !== "purchase") return event;
  const occurredAt = saleDateOf(body);
  return occurredAt ? { ...event, occurredAt } : event;
}

function normalizeEventFields(provider: ProviderId, body: Body): NormalizedEvent {
  switch (provider) {
    case "kambafy": {
      const eventType = text(pick(body, "event"));
      if (eventType === "test.webhook") return ignore(eventType, "Teste recebido da Kambafy.");
      const status = statusFrom(
        {
          "payment.success": "approved",
          "order.completed": "approved",
          "product.purchased": "approved",
          "refund.approved": "refunded",
          "order.pending": "pending",
          "order.created": "pending",
          "payment.failed": "failed",
          "order.cancelled": "abandoned",
        },
        eventType,
      );
      if (!status) return ignore(eventType, "Evento que não altera vendas.");
      return purchase(eventType, status, {
        email: text(pick(body, "email", "data.customer_email", "data.email")) || null,
        name: text(pick(body, "name", "data.customer_name")),
        phone: text(pick(body, "phone", "data.customer_phone")) || null,
        product: text(pick(body, "data.product_name", "product_name")),
        amountValue: parseAmount(pick(body, "data.total_price", "data.amount", "data.price")),
        currency: currencyCode(pick(body, "data.currency")) ?? "AOA",
        externalId: text(pick(body, "data.order_id", "order_id")) || null,
        productId: text(pick(body, "data.product_id")) || null,
      });
    }
    case "hotmart": {
      const eventType = text(pick(body, "event"));
      const status = statusFrom(
        {
          PURCHASE_APPROVED: "approved",
          PURCHASE_COMPLETE: "approved",
          PURCHASE_REFUNDED: "refunded",
          PURCHASE_CHARGEBACK: "refunded",
          PURCHASE_BILLET_PRINTED: "pending",
          PURCHASE_CANCELED: "failed",
          PURCHASE_EXPIRED: "abandoned",
          PURCHASE_OUT_OF_SHOPPING_CART: "abandoned",
        },
        eventType,
      );
      if (!status) return ignore(eventType, "Evento que não altera vendas.");
      const areaCode = text(pick(body, "data.buyer.checkout_phone_code"));
      const phone = text(pick(body, "data.buyer.checkout_phone"));
      return purchase(eventType, status, {
        email: text(pick(body, "data.buyer.email")) || null,
        name: text(pick(body, "data.buyer.name")),
        phone: phone ? `${areaCode}${phone}` : null,
        product: text(pick(body, "data.product.name")),
        productId: text(pick(body, "data.product.id", "data.product.ucode")) || null,
        amountValue: parseAmount(pick(body, "data.purchase.price.value")),
        currency: currencyCode(pick(body, "data.purchase.price.currency_value")),
        // O abandono de carrinho não tem transacção: fica com o id do próprio evento.
        externalId: text(pick(body, "data.purchase.transaction")) || prefixed("cart", pick(body, "id")),
      });
    }
    case "kiwify": {
      const eventType = text(pick(body, "webhook_event_type", "order_status"));
      const status = statusFrom(
        {
          paid: "approved",
          refunded: "refunded",
          chargedback: "refunded",
          waiting_payment: "pending",
          refused: "failed",
        },
        text(pick(body, "order_status")),
      );
      if (!status) return ignore(eventType, "Evento que não altera vendas.");
      const cents = parseAmount(pick(body, "Commissions.charge_amount"));
      return purchase(eventType, status, {
        email: text(pick(body, "Customer.email")) || null,
        name: text(pick(body, "Customer.full_name", "Customer.first_name")),
        phone: text(pick(body, "Customer.mobile")) || null,
        product: text(pick(body, "Product.product_name")),
        productId: text(pick(body, "Product.product_id")) || null,
        amountValue: cents === null ? null : cents / 100,
        currency: currencyCode(pick(body, "Commissions.currency")),
        externalId: text(pick(body, "order_id")) || null,
      });
    }
    case "eduzz": {
      const eventType = text(pick(body, "event"));
      if (eventType === "ping") return ignore(eventType, "Teste recebido da Eduzz.");
      if (eventType === "sun.cart_abandonment") {
        const step = text(pick(body, "data.lastStep")).replace(/-/g, "_");
        return purchase(eventType, step === "payment_failed" ? "failed" : "abandoned", {
          email: text(pick(body, "data.customer.email")) || null,
          name: text(pick(body, "data.customer.name")),
          phone: text(pick(body, "data.customer.cellphone", "data.customer.phone")) || null,
          product: text(pick(body, "data.productName", "data.product.name")),
          productId: text(pick(body, "data.productId.0", "data.productId")) || null,
          amountValue: null,
          currency: null,
          externalId: text(pick(body, "data.transactionId")) || prefixed("cart", pick(body, "id")),
        });
      }
      const status = statusFrom(
        {
          "myeduzz.invoice_paid": "approved",
          "myeduzz.invoice_refunded": "refunded",
          "myeduzz.invoice_chargeback": "refunded",
          "myeduzz.invoice_opened": "pending",
          "myeduzz.invoice_waiting_payment": "pending",
          "myeduzz.invoice_recovering": "failed",
          "myeduzz.invoice_canceled": "abandoned",
          "myeduzz.invoice_expired": "abandoned",
        },
        eventType,
      );
      if (!status) return ignore(eventType, "Evento que não altera vendas.");
      return purchase(eventType, status, {
        email: text(pick(body, "data.buyer.email")) || null,
        name: text(pick(body, "data.buyer.name")),
        phone: text(pick(body, "data.buyer.cellphone", "data.buyer.phone")) || null,
        product: text(pick(body, "data.items.0.name", "data.offer.name")),
        productId: text(pick(body, "data.items.0.productId")) || null,
        amountValue: parseAmount(pick(body, "data.paid.value")),
        currency: currencyCode(pick(body, "data.paid.currency")),
        externalId: text(pick(body, "data.id")) || null,
      });
    }
    case "stripe": {
      const eventType = text(pick(body, "type"));
      const object = pick(body, "data.object") as Body;
      const minor = (amount: unknown, currency: string | null) => {
        const n = parseAmount(amount);
        if (n === null) return null;
        return currency && ZERO_DECIMAL.has(currency.toLowerCase()) ? n : n / 100;
      };
      const session: Record<string, PaymentStatus | "by_payment"> = {
        "checkout.session.completed": "by_payment",
        "checkout.session.async_payment_succeeded": "by_payment",
        "checkout.session.async_payment_failed": "failed",
        "checkout.session.expired": "abandoned",
      };
      const sessionStatus = session[eventType];
      if (sessionStatus) {
        const paid = ["paid", "no_payment_required"].includes(text(pick(object, "payment_status")));
        const currency = currencyCode(pick(object, "currency"));
        const status = sessionStatus !== "by_payment" ? sessionStatus : paid ? "approved" : "pending";
        return purchase(eventType, status, {
          email: text(pick(object, "customer_details.email", "customer_email")) || null,
          name: text(pick(object, "customer_details.name")),
          phone: text(pick(object, "customer_details.phone")) || null,
          product: text(pick(object, "metadata.product", "metadata.product_name")) || "Stripe",
          productId: text(pick(object, "metadata.product_id")) || null,
          amountValue: minor(pick(object, "amount_total"), currency),
          currency,
          // O payment_intent é o mesmo na venda e no reembolso.
          externalId: text(pick(object, "payment_intent", "id")) || null,
        });
      }
      if (eventType === "payment_intent.payment_failed") {
        // Uma tentativa recusada; o mesmo payment_intent pode ainda ser pago a seguir.
        const currency = currencyCode(pick(object, "currency"));
        return purchase(eventType, "failed", {
          email:
            text(pick(object, "receipt_email", "last_payment_error.payment_method.billing_details.email")) || null,
          name: text(pick(object, "last_payment_error.payment_method.billing_details.name")),
          phone: null,
          product: text(pick(object, "metadata.product", "metadata.product_name", "description")) || "Stripe",
          amountValue: minor(pick(object, "amount"), currency),
          currency,
          externalId: text(pick(object, "id")) || null,
        });
      }
      if (eventType === "charge.refunded") {
        // A Stripe manda este evento também em reembolsos parciais: só um reembolso total desfaz a venda.
        const amount = Number(pick(object, "amount")) || 0;
        const refunded = Number(pick(object, "amount_refunded")) || 0;
        if (pick(object, "refunded") !== true && (amount <= 0 || refunded < amount))
          return ignore(eventType, "Reembolso parcial: a venda continua a contar.");
      }
      if (eventType === "charge.refunded" || (eventType === "charge.dispute.closed" && text(pick(object, "status")) === "lost")) {
        // Disputa perdida (chargeback): a venda é desfeita como num reembolso.
        const currency = currencyCode(pick(object, "currency"));
        return purchase(eventType, "refunded", {
          email: text(pick(object, "billing_details.email", "receipt_email")) || null,
          name: text(pick(object, "billing_details.name")),
          phone: text(pick(object, "billing_details.phone")) || null,
          product: text(pick(object, "metadata.product", "description")) || "Stripe",
          amountValue: minor(pick(object, "amount"), currency),
          currency,
          externalId: text(pick(object, "payment_intent", "id")) || null,
        });
      }
      return ignore(eventType, "Evento que não altera vendas.");
    }
    case "webhook": {
      const raw = text(pick(body, "status", "event")).toLowerCase();
      const status = webhookStatus(raw);
      if (!status)
        return ignore(
          raw || "sem estado",
          raw
            ? "Estado desconhecido ou intermédio: use approved, pending, failed, abandoned ou refunded."
            : "Pedido sem estado: não é contado como venda. Envie status com approved, pending, failed, abandoned ou refunded.",
        );
      return purchase(raw || "purchase", status, {
        email: text(pick(body, "email", "buyer_email", "customer.email")) || null,
        name: text(pick(body, "name", "buyer_name", "customer.name")),
        phone: text(pick(body, "phone", "customer.phone")) || null,
        product: text(pick(body, "product", "product_name")),
        productId: text(pick(body, "product_id")) || null,
        amountValue: parseAmount(pick(body, "amount", "value", "price")),
        currency: currencyCode(pick(body, "currency")),
        externalId: text(pick(body, "id", "transaction_id", "order_id")) || null,
      });
    }
    default:
      return ignore("", "Esta integração não recebe vendas.");
  }
}
