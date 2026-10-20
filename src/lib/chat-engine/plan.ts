/**
 * Plano de interacções: de cada bloco nascem as oportunidades de alguém
 * escrever, com dependência explícita (antes, depois ou livre), janela
 * humana, formato esperado, quantas pessoas é plausível e o contexto dos
 * 30 a 90 segundos anteriores. A IA escolhe texto e pessoa dentro disto.
 */
import { BLOCK_LABEL, DEPENDENCY_LABEL, INTERACTION_LABEL } from "./labels";
import {
  BEFORE_READ_MAX_MS,
  BEFORE_READ_MIN_MS,
  FIRST_ANSWER_MIN_MS,
  STRONG_SPAN_MS,
  ANSWER_SPAN_MS,
} from "./timing";
import type { InteractionSlot, OfferContext, ReferencedItem, SemanticBlock } from "./types";

export type PlanOptions = {
  fromMs: number;
  toMs: number;
  participants: number;
  /** Mensagens por minuto desejadas, para as partes livres. */
  perMinute: number;
  offerStartMs: number | null;
  /**
   * Quem apresenta. O nome dele nunca é alguém do chat: "Carol, 97 euros?" é uma pergunta de alguém
   * dirigida à Carol, não uma mensagem da Carol.
   */
  hostName?: string | null | undefined;
};

/** Depois de nomeada, a mesma pessoa não volta a «aparecer» antes de cada menção seguinte durante este tempo. */
export const PRESENCE_REPEAT_MS = 45_000;

function firstNameOf(name: string | null | undefined) {
  return (name ?? "").trim().split(/\s+/)[0]?.toLocaleLowerCase("pt") ?? "";
}

/**
 * O que o apresentador leu, sem o próprio apresentador: um item com o nome dele passa a pergunta do chat
 * (quando tem conteúdo e o bloco é mesmo uma leitura ou resposta ao chat) ou cai (uma fala imaginada,
 * "Carol, eu quero trabalhar só com academias", não é ninguém a escrever).
 */
export function referencedWithoutHost(
  block: Pick<SemanticBlock, "type" | "referenced">,
  hostName: string | null | undefined,
): ReferencedItem[] {
  const host = firstNameOf(hostName);
  if (!host) return block.referenced;
  const reading = block.type === "CHAT_READING" || block.type === "CHAT_RESPONSE";
  const out: ReferencedItem[] = [];
  for (const item of block.referenced) {
    if (item.kind !== "name" || firstNameOf(item.name) !== host) {
      out.push(item);
      continue;
    }
    if (reading && item.text && !out.some((o) => o.kind === "question" && o.text === item.text))
      out.push({ kind: "question", name: null, place: null, text: item.text });
  }
  return out;
}

/** Abaixo disto o bloco não gera pretextos nem cascatas grandes. */
export const CONFIDENCE_FLOOR = 0.55;
export const CONTEXT_MS = 90_000;
export const CONTEXT_CHARS = 520;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

function contextBefore(blocks: readonly SemanticBlock[], block: SemanticBlock): string {
  const text = blocks
    .filter(
      (b) =>
        b.type !== "SILENCE" && b.endMs <= block.startMs && b.endMs >= block.startMs - CONTEXT_MS,
    )
    .map((b) => b.text)
    .join(" ")
    .trim();
  return text.length > CONTEXT_CHARS ? `…${text.slice(-CONTEXT_CHARS)}` : text;
}

function offerContextOf(block: SemanticBlock, offerStartMs: number | null): OfferContext {
  if (offerStartMs == null) return "desconhecido";
  return block.startMs < offerStartMs ? "antes" : "depois";
}

function speechOf(block: SemanticBlock) {
  const text = block.text.replace(/\s+/g, " ").trim();
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}

/** As oportunidades de um trecho [fromMs, toMs] do webinar. */
export function planInteractions(
  blocks: readonly SemanticBlock[],
  options: PlanOptions,
): InteractionSlot[] {
  const out: InteractionSlot[] = [];
  const people = Math.max(3, options.participants);
  const ordered = [...blocks].sort((a, b) => a.startMs - b.startMs);
  /** Quando cada nome foi nomeado pela última vez, para a presença não se repetir a cada menção. */
  const namedAt = new Map<string, number>();

  ordered.forEach((block, index) => {
    const referenced = referencedWithoutHost(block, options.hostName);
    const names = referenced.filter((r) => r.kind === "name");
    // Nomes que o apresentador diz e que ainda não «apareceram» no chat há pouco.
    const newNames = names.filter((r) => {
      const last = namedAt.get(firstNameOf(r.name));
      return last == null || block.startMs - last > PRESENCE_REPEAT_MS;
    });
    for (const r of names) namedAt.set(firstNameOf(r.name), block.endMs);
    // Um bloco conta para o trecho se a sua janela puder cair dentro dele.
    if (block.endMs < options.fromMs - 30_000 || block.startMs > options.toMs + 8000) return;
    const previous = ordered[index - 1] ?? null;
    const low = block.confidence < CONFIDENCE_FLOOR;
    const offer = offerContextOf(block, options.offerStartMs);
    const base = {
      blockId: block.id,
      blockType: block.type,
      blockStartMs: block.startMs,
      blockEndMs: block.endMs,
      keyword: block.keyword,
      speech: speechOf(block),
      context: contextBefore(ordered, block),
      confidence: block.confidence,
      offerContext: offer,
      referenced: [] as InteractionSlot["referenced"],
    };

    const after = (
      suffix: string,
      interaction: InteractionSlot["interaction"],
      max: number,
      min: number,
      strong: boolean,
      reason: string,
      spanMs = strong ? STRONG_SPAN_MS : ANSWER_SPAN_MS,
    ) => {
      const cap = low ? Math.max(1, Math.floor(max / 2)) : max;
      // As pessoas que o apresentador nomeou ao pedir ("Letícia, Joana, coloquem quanto já faturaram")
      // estão entre quem responde.
      const expected = block.expectsResponse ? names : [];
      out.push({
        ...base,
        id: `${block.id}_${suffix}`,
        dependency: "AFTER",
        interaction,
        windowStartMs: block.endMs + FIRST_ANSWER_MIN_MS,
        windowEndMs: block.endMs + spanMs,
        minComments: low ? 0 : Math.max(Math.min(min, cap), Math.min(expected.length, cap)),
        maxComments: Math.max(cap, expected.length),
        strong,
        referenced: expected,
        needsReview: low,
        reason,
      });
    };

    const before = (
      suffix: string,
      items: InteractionSlot["referenced"],
      reason: string,
      maxBackMs = BEFORE_READ_MAX_MS,
    ) => {
      if (low) return;
      let windowStart = block.startMs - maxBackMs;
      let windowEnd = block.startMs - BEFORE_READ_MIN_MS;
      // Caso difícil: pergunta e leitura imediata. A mensagem lida só pode existir
      // depois da pergunta; se não houver 2 s de folga, fica colada antes da leitura.
      let constrained = false;
      if (
        previous &&
        previous.expectsResponse &&
        previous.endMs + FIRST_ANSWER_MIN_MS > windowStart
      ) {
        constrained = true;
        windowStart = previous.endMs + FIRST_ANSWER_MIN_MS;
        if (windowEnd < windowStart) windowEnd = Math.min(block.startMs - 500, windowStart + 300);
      }
      if (!constrained && windowEnd - windowStart < 600) windowStart = Math.max(0, windowEnd - 600);
      // Caso difícil: o apresentador lê o chat antes de haver tempo para alguém escrever.
      if (windowEnd <= 1000 || windowEnd < windowStart) return;
      const count = Math.max(1, items.length);
      out.push({
        ...base,
        id: `${block.id}_${suffix}`,
        dependency: "BEFORE",
        interaction: "NONE",
        windowStartMs: Math.max(0, windowStart),
        windowEndMs: windowEnd,
        minComments: count,
        maxComments: Math.max(count, items.length ? items.length : 2),
        strong: false,
        referenced: items,
        needsReview: false,
        reason,
      });
    };

    // Quem o apresentador nomeia já escreveu: "está aqui a minha aluna Letícia", "a Alessandra já faturou
    // 400 euros". Seja qual for o tipo do bloco (pedido, prova social, história…), a pessoa existe no chat
    // antes de ser nomeada. As leituras do chat tratam disto abaixo, com o conteúdo lido.
    if (
      block.type !== "CHAT_READING" &&
      block.type !== "CHAT_RESPONSE" &&
      block.readsChat &&
      newNames.length > 0
    )
      before(
        "presenca",
        newNames,
        "a pessoa que o apresentador nomeia já tinha escrito no chat",
        BEFORE_READ_MAX_MS + 4000,
      );

    switch (block.type) {
      case "QUESTION_TO_AUDIENCE":
        after(
          "resp",
          block.interaction,
          clamp(people * 0.18, 2, 12),
          2,
          block.confidence >= 0.8,
          "responde à pergunta do apresentador",
        );
        break;
      case "COMMENT_REQUEST":
        after(
          "resp",
          block.interaction,
          clamp(people * 0.32, 3, 16),
          3,
          true,
          "faz o que o apresentador pediu no chat",
        );
        break;
      case "POLL":
        after(
          "resp",
          block.interaction,
          clamp(people * 0.32, 3, 16),
          3,
          true,
          "participa na sondagem",
        );
        break;
      case "FEEDBACK_REQUEST":
        after(
          "resp",
          block.interaction,
          clamp(people * 0.25, 2, 14),
          2,
          true,
          "confirma como o apresentador pediu",
        );
        break;
      case "CHAT_READING": {
        const items = referenced.length
          ? referenced
          : [{ kind: "message" as const, name: null, place: null, text: "" }];
        before("lido", items, "é a mensagem que o apresentador vai ler em voz alta");
        if (names.length > 0)
          after(
            "agradece",
            "REACTION",
            2,
            0,
            false,
            "a pessoa lida reage a ser mencionada",
            12_000,
          );
        break;
      }
      case "CHAT_RESPONSE": {
        const items = referenced.length
          ? referenced
          : [{ kind: "question" as const, name: null, place: null, text: "" }];
        before("pergunta", items, "é a pergunta a que o apresentador vai responder", 25_000);
        after("agradece", "REACTION", 2, 0, false, "agradece a resposta", 12_000);
        break;
      }
      case "SOCIAL_PROOF":
        after(
          "reage",
          "REACTION",
          clamp(people * 0.12, 1, 8),
          1,
          false,
          "reage à prova social",
          20_000,
        );
        break;
      case "EMOTIONAL_MOMENT":
        after(
          "reage",
          "REACTION",
          clamp(people * 0.12, 1, 8),
          1,
          false,
          "reage ao momento emocional",
          20_000,
        );
        break;
      case "STORY":
        after(
          "reage",
          "REACTION",
          clamp(people * 0.06, 1, 4),
          0,
          false,
          "reage à história",
          20_000,
        );
        break;
      case "OFFER":
      case "CTA":
        // Ninguém fala da oferta antes de ela existir.
        if (offer === "antes") break;
        after(
          "reage",
          "REACTION",
          clamp(people * 0.15, 1, 10),
          1,
          block.type === "CTA",
          block.type === "CTA" ? "reage à chamada à acção" : "reage à oferta",
          25_000,
        );
        break;
      case "CONTENT":
      case "TECHNICAL":
      case "OTHER":
      case "SILENCE":
      case "TRANSITION": {
        const minutes = Math.max(0, block.endMs - block.startMs) / 60_000;
        const factor =
          block.type === "CONTENT"
            ? 0.6
            : block.type === "TECHNICAL"
              ? 0.2
              : block.type === "SILENCE"
                ? 0.15
                : 0.1;
        const max = Math.round(minutes * options.perMinute * factor);
        if (max <= 0) break;
        out.push({
          ...base,
          id: `${block.id}_livre`,
          dependency: "INDEPENDENT",
          interaction: "NONE",
          windowStartMs: block.startMs + 2000,
          windowEndMs: Math.max(block.startMs + 2000, block.endMs),
          minComments: 0,
          maxComments: Math.min(max, 4),
          strong: false,
          needsReview: false,
          reason:
            block.type === "SILENCE"
              ? "pausa do apresentador: só uma mensagem solta, sem reagir a nada"
              : block.type === "TECHNICAL"
                ? "parte técnica: quase silêncio"
                : "comentário solto sobre o que está a ser dito",
        });
        break;
      }
    }
  });

  return out
    .filter(
      (slot) =>
        slot.windowEndMs >= options.fromMs - 1000 && slot.windowStartMs <= options.toMs + 1000,
    )
    .sort((a, b) => a.windowStartMs - b.windowStartMs);
}

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function referencedLine(slot: InteractionSlot) {
  if (!slot.referenced.length) return "";
  const presence = slot.id.endsWith("_presenca");
  return slot.referenced
    .map((item) => {
      if (item.kind === "name")
        return `${item.name}${item.place ? ` (de ${item.place})` : ""}${
          item.text
            ? ` escreve: "${item.text}"`
            : item.place
              ? " diz de onde vê"
              : presence
                ? " escreve uma mensagem curta e natural (cumprimento, presença, ou o que o apresentador refere sobre ela a seguir), com este nome exacto"
                : " escreve o que o apresentador cita ou resume a seguir, com este nome exacto"
        }`;
      if (item.kind === "city") return `alguém de ${item.text} diz de onde vê`;
      if (item.kind === "question") return `alguém pergunta: "${item.text}"`;
      return "a mensagem que o apresentador vai ler";
    })
    .join("; ");
}

function respondersLine(slot: InteractionSlot) {
  const names = slot.referenced.filter((r) => r.kind === "name").map((r) => r.name!);
  if (slot.dependency !== "AFTER" || names.length === 0) return "";
  return ` · OBRIGATÓRIO entre quem responde (o apresentador dirigiu-se a elas pelo nome): ${names.join(", ")}`;
}

/** As oportunidades em texto, para o modelo escolher o que escrever. */
export function describeSlots(slots: readonly InteractionSlot[]): string {
  return slots
    .map((slot) => {
      const window = `${clock(slot.windowStartMs)}–${clock(slot.windowEndMs)}`;
      const when =
        slot.dependency === "AFTER"
          ? `DEPOIS da fala ${clock(slot.blockStartMs)}–${clock(slot.blockEndMs)}; janela ${window}`
          : slot.dependency === "BEFORE"
            ? `ANTES da fala às ${clock(slot.blockStartMs)}; janela ${window}`
            : `LIVRE durante ${window}`;
      const format =
        slot.interaction !== "NONE" && slot.interaction !== "REACTION"
          ? ` · formato: ${INTERACTION_LABEL[slot.interaction]}${slot.keyword ? ` ("${slot.keyword}")` : ""}`
          : "";
      const count =
        slot.minComments > 0
          ? `${slot.minComments} a ${slot.maxComments} mensagens`
          : `até ${slot.maxComments} mensagens`;
      const must =
        slot.dependency === "BEFORE" ? ` · OBRIGATÓRIO: ${referencedLine(slot)}` : respondersLine(slot);
      const review = slot.needsReview ? " · bloco incerto: poucas mensagens" : "";
      return `[${slot.id}] ${DEPENDENCY_LABEL[slot.dependency].toUpperCase()} · ${BLOCK_LABEL[slot.blockType]} · ${when} · ${count}${format}${must}${review}\n   fala: "${slot.speech}"${slot.context ? `\n   antes disso: "${slot.context}"` : ""}`;
    })
    .join("\n");
}
