/**
 * Segunda passagem: a validação determinística da cronologia.
 *
 * Dez verificações, por esta ordem, em cada mensagem:
 *  1. oferta antes de a oferta existir            → eliminada
 *  2. pretexto sem leitura do chat                 → passa a livre
 *  3. resposta antes da pergunta / fora da janela  → reposicionada
 *  4. mensagem lida depois de o apresentador a ler → reposicionada (ou eliminada sem tempo)
 *  5. formato diferente do pedido (sim/não, número, emoji, cidade, palavra) → eliminada
 *  6. nome lido pelo apresentador diferente do autor → corrigido
 *  7. mensagem repetida                            → eliminada
 *  8. "@Nome" sem mensagem anterior desse nome     → corrigido (ou eliminada)
 *  9. conhecimento do futuro (fala que ainda não aconteceu) → eliminada
 * 10. densidade por minuto e duas mensagens no mesmo instante → eliminada / reposicionada
 *
 * Cada mensagem sai com uma confiança: a do bloco, descontada por cada ajuste.
 */
import { KNOWN_PLACES } from "./blocks";
import { normalizeMessage } from "./merge";
import { ure } from "./regex";
import { BEFORE_READ_MIN_MS, FIRST_ANSWER_MIN_MS, FIRST_ANSWER_MAX_MS, rng } from "./timing";
import type { EngineComment, InteractionSlot, SemanticBlock } from "./types";

export type ValidationAction = "reposicionado" | "eliminado" | "corrigido";

export type EngineIssue = {
  commentId: string;
  rule: string;
  detail: string;
  action: ValidationAction;
  fromMs: number;
  toMs: number | null;
};

export type ValidateOptions = {
  blocks: readonly SemanticBlock[];
  slots: readonly InteractionSlot[];
  offerStartMs: number | null;
  durationMs: number;
  /** Tecto de mensagens por minuto. */
  perMinuteCap?: number;
};

export type ValidationResult = {
  kept: EngineComment[];
  removed: EngineComment[];
  issues: EngineIssue[];
  byRule: Record<string, number>;
};

export const OFFER_WORDS = ure(
  String.raw`\b(pre[çc]o|custa|quanto (?:é|e|fica|custa)|investimento|b[óo]nus|bonus|garantia|parcel|desconto|link|inscri[çc][ãa]o|inscrever|comprei|comprar|vaga|vagas|checkout|pagamento|cart[ãa]o)\b`,
  "i",
);

const PLACES = new Set(KNOWN_PLACES.map((p) => p.toLocaleLowerCase("pt")));
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const YES_NO_RE =
  /(^|\s)(s+i+m+|n+[ãa]+o+|nao|yes|claro|j[áa]|nunca|eu|tamb[ée]m|ainda n[ãa]o|positivo|negativo|com certeza|[óo]bvio|1|👍|🙋|✅|❌|simm+|siim+|faz sentido|concordo|verdade|isso)([\s!.,]|$)/iu;
const NUMBER_RE = ure(
  String.raw`(\d+|\b(?:um|uma|dois|duas|tr[êe]s|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|quinze|vinte|trinta|quarenta|cinquenta|cem|mil|zero|nenhum|nenhuma|meio|metade)\b)`,
  "i",
);
const PRAISE_RE =
  /^(muito bom|top|show|[óo]timo|excelente|perfeito|boa|adorei|amei|maravilha|sensacional|incr[íi]vel|demais|massa|verdade|isso mesmo|👏+|🔥+)[\s!.🔥👏💯🙌]*$/iu;

/** A mensagem respeita o formato pedido? */
export function matchesInteraction(
  slot: Pick<InteractionSlot, "interaction" | "keyword">,
  message: string,
): boolean {
  const text = message.trim();
  switch (slot.interaction) {
    case "YES_NO":
      return YES_NO_RE.test(text) || text.length <= 3;
    case "NUMBER":
      return NUMBER_RE.test(text);
    case "EMOJI":
      return EMOJI_RE.test(text);
    case "KEYWORD":
      return slot.keyword
        ? text.toLocaleLowerCase("pt").includes(slot.keyword.toLocaleLowerCase("pt"))
        : true;
    case "LOCATION": {
      const lower = text.toLocaleLowerCase("pt");
      if ([...PLACES].some((p) => lower.includes(p))) return true;
      return /(?<![\p{L}])\p{Lu}[\p{L}'-]{2,}(?![\p{L}])/u.test(
        text.replace(/^\p{Lu}/u, (m) => m.toLocaleLowerCase("pt")),
      );
    }
    case "NAME":
      return /\p{Lu}\p{Ll}{2,}/u.test(text) || /\bsou\b|\bchamo\b/i.test(text);
    default:
      return true;
  }
}

function significant(text: string): Set<string> {
  return new Set(
    normalizeMessage(text)
      .split(" ")
      .filter((w) => w.length >= 6),
  );
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0]?.toLocaleLowerCase("pt") ?? "";
}

export function validateEngine(
  comments: readonly EngineComment[],
  options: ValidateOptions,
): ValidationResult {
  const slotById = new Map(options.slots.map((s) => [s.id, s] as const));
  const blocks = [...options.blocks].sort((a, b) => a.startMs - b.startMs);
  const issues: EngineIssue[] = [];
  const removed: EngineComment[] = [];
  const kept: EngineComment[] = [];
  const seenMessages = new Set<string>();
  const usedNames = new Map<string, Set<string>>();
  const random = rng(comments.length + 11);

  const note = (
    c: EngineComment,
    rule: string,
    detail: string,
    action: ValidationAction,
    toMs: number | null,
  ) => issues.push({ commentId: c.id, rule, detail, action, fromMs: c.atMs, toMs });

  const sorted = [...comments].sort((a, b) => a.atMs - b.atMs);
  for (const original of sorted) {
    let c: EngineComment = { ...original };
    const slot = c.slotId ? (slotById.get(c.slotId) ?? null) : null;
    let confidence = slot ? slot.confidence : 0.5;
    let drop: [string, string] | null = null;

    // 1. Oferta antes de a oferta existir.
    const offerStart = options.offerStartMs;
    if (offerStart != null && c.atMs < offerStart && OFFER_WORDS.test(c.message)) {
      drop = [
        "oferta-antes-da-oferta",
        "Fala de preço, bónus, garantia ou inscrição antes de a oferta ser apresentada.",
      ];
    }

    // 2. Pretexto só existe quando o apresentador lê ou responde ao chat, ou nomeia alguém que está lá
    //    ("a minha aluna Letícia"): a presença dessa pessoa é um «antes» legítimo.
    if (
      !drop &&
      c.dependency === "BEFORE" &&
      slot &&
      slot.blockType !== "CHAT_READING" &&
      slot.blockType !== "CHAT_RESPONSE" &&
      !slot.referenced.some((r) => r.kind === "name")
    ) {
      note(
        c,
        "pretexto-sem-leitura",
        "Só há mensagem «antes» quando o apresentador lê ou responde ao chat.",
        "corrigido",
        c.atMs,
      );
      c = { ...c, dependency: "INDEPENDENT" };
      confidence *= 0.7;
    }

    // 3. Depois da fala: nunca antes de a pergunta acabar, nem fora da janela.
    if (!drop && c.dependency === "AFTER" && slot) {
      const earliest = slot.blockEndMs + FIRST_ANSWER_MIN_MS;
      if (c.atMs < earliest) {
        const target = Math.round(
          earliest + random() * (FIRST_ANSWER_MAX_MS - FIRST_ANSWER_MIN_MS),
        );
        note(
          c,
          "resposta-antes-da-pergunta",
          "A resposta aparecia antes de o apresentador acabar de perguntar.",
          "reposicionado",
          target,
        );
        c = { ...c, atMs: target };
        confidence *= 0.8;
      } else if (c.atMs > slot.windowEndMs + 5000) {
        const target = Math.round(slot.windowEndMs - random() * 2000);
        note(
          c,
          "fora-da-janela",
          "A resposta chegava tarde de mais para a pergunta.",
          "reposicionado",
          target,
        );
        c = { ...c, atMs: Math.max(earliest, target) };
        confidence *= 0.8;
      }
    }

    // 4. Antes da leitura: a mensagem tem de existir antes de o apresentador a ler.
    if (!drop && c.dependency === "BEFORE" && slot) {
      const latest = slot.blockStartMs - BEFORE_READ_MIN_MS;
      if (c.atMs > latest) {
        const target = Math.round(latest - random() * 2000);
        if (target < 500)
          drop = [
            "sem-tempo-antes",
            "O apresentador lê o chat antes de haver tempo para alguém escrever.",
          ];
        else {
          note(
            c,
            "mensagem-depois-de-lida",
            "A mensagem aparecia depois de o apresentador a ler.",
            "reposicionado",
            target,
          );
          c = { ...c, atMs: target };
          confidence *= 0.8;
        }
      } else if (c.atMs < slot.windowStartMs - 10_000) {
        const target = slot.windowStartMs;
        note(
          c,
          "fora-da-janela",
          "A mensagem lida existia demasiado cedo para o apresentador a ter visto agora.",
          "reposicionado",
          target,
        );
        c = { ...c, atMs: target };
        confidence *= 0.8;
      }
    }

    // 5. Formato pedido pelo apresentador.
    if (!drop && c.dependency === "AFTER" && slot && !matchesInteraction(slot, c.message)) {
      drop = [
        "formato-errado",
        `O apresentador pediu ${slot.interaction === "YES_NO" ? "sim ou não" : slot.interaction === "NUMBER" ? "um número" : slot.interaction === "EMOJI" ? "um emoji" : slot.interaction === "LOCATION" ? "de onde vê" : slot.interaction === "KEYWORD" ? `a palavra "${slot.keyword}"` : "o nome"} e a mensagem não responde a isso.`,
      ];
    }

    // 6. O nome que o apresentador diz é o autor da mensagem lida.
    if (
      !drop &&
      c.dependency === "BEFORE" &&
      slot &&
      slot.referenced.some((r) => r.kind === "name")
    ) {
      const names = slot.referenced.filter((r) => r.kind === "name").map((r) => r.name!);
      const used = usedNames.get(slot.id) ?? new Set<string>();
      const matches = names.find((n) => firstName(n) === firstName(c.author));
      if (matches && !used.has(firstName(matches))) used.add(firstName(matches));
      else {
        const free = names.find((n) => !used.has(firstName(n)));
        if (free) {
          note(
            c,
            "nome-lido",
            `O apresentador diz "${free}" e a mensagem era de "${c.author}".`,
            "corrigido",
            c.atMs,
          );
          c = {
            ...c,
            author:
              c.author.trim().split(/\s+/).length > 1 && firstName(c.author) !== firstName(free)
                ? `${free} ${c.author.trim().split(/\s+/).slice(-1)[0]}`
                : free,
          };
          used.add(firstName(free));
          confidence *= 0.9;
        }
      }
      usedNames.set(slot.id, used);
    }

    // 7. Nada se repete.
    const key = normalizeMessage(c.message);
    if (!drop && key && seenMessages.has(key))
      drop = ["duplicado", "Mensagem igual a outra já existente."];

    // 8. "@Nome" só depois de esse nome ter escrito.
    if (!drop) {
      const reply = c.message.match(/^@(\S+)\s*/u);
      if (reply) {
        const target = reply[1]!.toLocaleLowerCase("pt").replace(/[,.:!]+$/u, "");
        const before = kept.some(
          (k) => firstName(k.author) === target && k.atMs < c.atMs && c.atMs - k.atMs <= 120_000,
        );
        if (!before) {
          const rest = c.message.slice(reply[0].length).trim();
          if (rest.length >= 3) {
            note(
              c,
              "resposta-sem-mensagem",
              `Responde a ${reply[1]} sem que ${reply[1]} tenha escrito antes.`,
              "corrigido",
              c.atMs,
            );
            c = { ...c, message: rest, replyTo: null };
            confidence *= 0.8;
          } else
            drop = [
              "resposta-sem-mensagem",
              `Responde a ${reply[1]} sem que ${reply[1]} tenha escrito antes.`,
            ];
        } else c = { ...c, replyTo: reply[1]! };
      }
    }

    // 9. Ninguém conhece o futuro: palavras de uma fala que ainda não aconteceu.
    if (!drop && c.dependency !== "BEFORE") {
      const mine = significant(c.message);
      if (mine.size > 0) {
        const past = new Set<string>();
        for (const block of blocks) {
          if (block.startMs > c.atMs + 3000) break;
          for (const w of significant(block.text)) past.add(w);
        }
        const future = blocks.filter((b) => b.startMs > c.atMs + 3000 && b.type !== "SILENCE");
        let hits = 0;
        for (const w of mine) {
          if (past.has(w)) continue;
          if (future.some((b) => significant(b.text).has(w))) hits += 1;
        }
        if (hits >= 2)
          drop = [
            "conhecimento-futuro",
            "A mensagem fala de algo que o apresentador ainda não disse.",
          ];
      }
    }

    // Fora do vídeo.
    if (!drop && (c.atMs < 0 || (options.durationMs > 0 && c.atMs > options.durationMs)))
      drop = ["fora-do-video", "Instante fora do vídeo."];

    // Uma mensagem solta em silêncio não aplaude o nada.
    if (
      !drop &&
      c.dependency === "INDEPENDENT" &&
      slot &&
      slot.blockType === "SILENCE" &&
      PRAISE_RE.test(c.message)
    )
      drop = ["reaccao-ao-silencio", "Aplaude durante uma pausa em que nada foi dito."];

    if (drop) {
      note(c, drop[0], drop[1], "eliminado", null);
      removed.push(c);
      continue;
    }
    if (key) seenMessages.add(key);
    kept.push({ ...c, confidence: Math.round(Math.max(0, Math.min(1, confidence)) * 100) / 100 });
  }

  // 10. Densidade por minuto e mesmo instante.
  kept.sort((a, b) => a.atMs - b.atMs);
  const cap = Math.max(4, options.perMinuteCap ?? 40);
  const byMinute = new Map<number, EngineComment[]>();
  for (const c of kept) {
    const minute = Math.floor(c.atMs / 60_000);
    byMinute.set(minute, [...(byMinute.get(minute) ?? []), c]);
  }
  const overflow = new Set<string>();
  for (const list of byMinute.values()) {
    if (list.length <= cap) continue;
    const order = [...list].sort((a, b) => {
      const pa = a.dependency === "INDEPENDENT" ? 0 : 1;
      const pb = b.dependency === "INDEPENDENT" ? 0 : 1;
      return pa - pb || a.confidence - b.confidence;
    });
    for (const c of order.slice(0, list.length - cap)) overflow.add(c.id);
  }
  const dense = kept.filter((c) => !overflow.has(c.id));
  for (const c of kept) {
    if (!overflow.has(c.id)) continue;
    note(c, "densidade", "Mais mensagens num minuto do que o chat aguenta.", "eliminado", null);
    removed.push(c);
  }

  const spaced: EngineComment[] = [];
  let previous = -Infinity;
  for (const c of dense) {
    let at = c.atMs;
    if (at - previous < 700) {
      const slot = c.slotId ? slotById.get(c.slotId) : null;
      const latest =
        c.dependency === "BEFORE" && slot ? slot.blockStartMs - BEFORE_READ_MIN_MS : Infinity;
      at = previous + 700 + Math.round(random() * 300);
      if (at > latest) at = Math.max(0, latest);
      if (at !== c.atMs)
        note(c, "mesmo-instante", "Duas mensagens no mesmo instante.", "reposicionado", at);
    }
    spaced.push(at === c.atMs ? c : { ...c, atMs: at });
    previous = Math.max(previous, at);
  }

  const byRule: Record<string, number> = {};
  for (const issue of issues) byRule[issue.rule] = (byRule[issue.rule] ?? 0) + 1;
  return { kept: spaced, removed, issues, byRule };
}
