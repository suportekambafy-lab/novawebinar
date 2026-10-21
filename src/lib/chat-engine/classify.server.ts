/**
 * Classificação dos blocos de fala com a IA, por cima das regras.
 *
 * As regras valem sozinhas. A IA lê os blocos em lotes e afina o tipo, o que
 * o apresentador espera do público, se é retórico, e o que ele leu do chat
 * (nomes, cidades, perguntas). Nunca inventa blocos: só classifica os que
 * existem. O resultado fica guardado na versão da transcrição.
 */
import { AIError, chatJson, isConfigured } from "@/lib/ai/gateway.server";
import { s, schema } from "@/lib/ai/schema";
import * as engine from "@/lib/temporal/engine.server";
import type { TranscriptVersion } from "@/lib/temporal/engine.server";

import { buildSemanticBlocks, cueEndFor } from "./blocks";
import {
  BLOCK_TYPES,
  INTERACTION_TYPES,
  type BlockType,
  type InteractionType,
  type ReferencedItem,
  type SemanticBlock,
} from "./types";

const BATCH = 40;

export const BLOCK_CLASSES = schema("speech_block_classes", {
  blocks: s.array(
    s.object({
      id: s.string(),
      type: s.string(BLOCK_TYPES),
      interaction: s.string(INTERACTION_TYPES),
      expectsResponse: s.boolean(),
      rhetorical: s.boolean(),
      readsChat: s.boolean(),
      names: s.array(s.string()),
      cities: s.array(s.string()),
      questions: s.array(s.string()),
      keyword: s.string(),
      confidence: s.number(),
    }),
  ),
});

type AiClass = {
  id: string;
  type: BlockType;
  interaction: InteractionType;
  expectsResponse: boolean;
  rhetorical: boolean;
  readsChat: boolean;
  names: string[];
  cities: string[];
  questions: string[];
  keyword: string;
  confidence: number;
};

function clock(ms: number) {
  const sec = Math.floor(ms / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

async function askBatch(chunk: SemanticBlock[], hostName: string | null): Promise<AiClass[]> {
  const lines = chunk
    .map(
      (b) =>
        `${b.id} | ${clock(b.startMs)}–${clock(b.endMs)} | ${b.text.replace(/\s+/g, " ").slice(0, 600)}`,
    )
    .join("\n");
  const hostFirst = hostName?.trim().split(/\s+/)[0] ?? "";
  const prompt = [
    "És um analista de webinars em português (Portugal, Brasil, Angola, Moçambique). Recebes blocos de fala do apresentador, por ordem, e classificas CADA bloco. Não inventes blocos nem mudes os ids.",
    hostFirst
      ? `O apresentador chama-se ${hostName}. Nunca o ponhas em names: quando alguém do chat se dirige a ele pelo nome ("${hostFirst}, 97 euros?", "${hostFirst}, como é que eu faço?"), isso é uma pergunta do chat: põe o texto em questions. Uma fala que ele imagina ("${hostFirst}, eu quero trabalhar só com academias") não é ninguém a escrever: readsChat=false.`
      : "",
    "Quando ele nomeia alunos ou clientes presentes («está aqui a minha aluna Letícia», «Letícia, Joana, sejam bem-vindas»), isso é readsChat=true com esses nomes em names, mesmo que o bloco seja um pedido ou prova social.",
    "",
    "Tipos: CONTENT (explica), QUESTION_TO_AUDIENCE (pergunta ao público e espera resposta no chat), COMMENT_REQUEST (pede que escrevam algo no chat), FEEDBACK_REQUEST (pede confirmação: faz sentido? manda um sim / um emoji), POLL (quem aqui já…, levanta a mão, 1 ou 2), CHAT_READING (lê ou cita mensagens do chat, nomes, cidades), CHAT_RESPONSE (responde a uma pergunta que veio do chat), SOCIAL_PROOF (resultados de alunos, depoimentos), EMOTIONAL_MOMENT, CTA (clica, inscreve-te, link), OFFER (preço, bónus, garantia, o que inclui), STORY, TRANSITION (muda de assunto), TECHNICAL (passo a passo técnico), OTHER.",
    "Uma pergunta que o próprio apresentador responde a seguir é retórica: rhetorical=true, expectsResponse=false, tipo CONTENT.",
    "expectsResponse=true só quando ele fica mesmo à espera de que o público escreva (pergunta directa, pedido, «manda um sim», sondagem), mesmo que continue a falar a seguir. Quando lê o que escreveram (nomes, cidades, valores, perguntas) é CHAT_READING; quando responde a uma pergunta que veio do chat é CHAT_RESPONSE; quando comenta o que vê no chat sem ler ninguém em concreto («estou a ver muita gente a dizer que sim») é CHAT_READING sem names.",
    "interaction: o formato que o público deve responder: YES_NO, NUMBER, EMOJI, LOCATION (de onde vê), KEYWORD (uma palavra pedida; põe a palavra em keyword), NAME, SHORT_ANSWER, LONG_ANSWER, REACTION (reagir sem pergunta), NONE.",
    "readsChat=true quando ele lê, cita, agradece ou responde ao chat. Em names põe os nomes que ele diz (só nomes de pessoas, exactamente como ditos), em cities as cidades ou países que ele lê, em questions as perguntas do chat que ele repete (texto curto, sem o nome).",
    "confidence entre 0 e 1: quão seguro estás da classificação. Com dúvida real, dá menos de 0.6.",
    "",
    `Blocos (id | tempo | fala):\n${lines}`,
  ].join("\n");

  const result = await chatJson({
    task: "analysis",
    system:
      "Classificas blocos de fala de webinars. Respondes só com o JSON pedido, um item por bloco, com os mesmos ids.",
    user: prompt,
    schema: BLOCK_CLASSES,
  });
  if (!result.ok) throw new AIError(result);
  const parsed = result.json as { blocks?: Partial<AiClass>[] };
  return (parsed.blocks ?? [])
    .filter((b): b is AiClass => typeof b.id === "string" && typeof b.type === "string")
    .map((b) => ({
      id: b.id,
      type: (BLOCK_TYPES as readonly string[]).includes(b.type) ? b.type : "CONTENT",
      interaction: (INTERACTION_TYPES as readonly string[]).includes(b.interaction ?? "")
        ? (b.interaction as InteractionType)
        : "NONE",
      expectsResponse: Boolean(b.expectsResponse),
      rhetorical: Boolean(b.rhetorical),
      readsChat: Boolean(b.readsChat),
      names: Array.isArray(b.names) ? b.names.map(String).filter(Boolean).slice(0, 12) : [],
      cities: Array.isArray(b.cities) ? b.cities.map(String).filter(Boolean).slice(0, 12) : [],
      questions: Array.isArray(b.questions)
        ? b.questions.map(String).filter(Boolean).slice(0, 12)
        : [],
      keyword: String(b.keyword ?? "")
        .trim()
        .slice(0, 30),
      confidence: Math.max(0, Math.min(1, Number(b.confidence) || 0)),
    }));
}

const STRONG_RULE: ReadonlySet<BlockType> = new Set([
  "COMMENT_REQUEST",
  "CHAT_READING",
  "FEEDBACK_REQUEST",
  "POLL",
]);

/** Junta a leitura da IA às regras: a IA manda quando está mais segura. */
export function mergeClassification(block: SemanticBlock, ai: AiClass): SemanticBlock {
  const rulesStrong = STRONG_RULE.has(block.type) && block.confidence >= ai.confidence;
  const type = rulesStrong || ai.confidence < 0.5 ? block.type : ai.type;
  const changed = type !== block.type;
  const interaction = changed || block.interaction === "NONE" ? ai.interaction : block.interaction;
  const expects =
    type === "QUESTION_TO_AUDIENCE" ||
    type === "COMMENT_REQUEST" ||
    type === "FEEDBACK_REQUEST" ||
    type === "POLL";
  const referenced: ReferencedItem[] = [...block.referenced];
  const has = (kind: ReferencedItem["kind"], value: string) =>
    referenced.some(
      (r) =>
        r.kind === kind &&
        (r.name ?? r.text).toLocaleLowerCase("pt") === value.toLocaleLowerCase("pt"),
    );
  if (ai.readsChat || type === "CHAT_READING" || type === "CHAT_RESPONSE") {
    for (const name of ai.names)
      if (!has("name", name)) referenced.push({ kind: "name", name, place: null, text: "" });
    for (const city of ai.cities)
      if (
        !has("city", city) &&
        !referenced.some((r) => r.place?.toLocaleLowerCase("pt") === city.toLocaleLowerCase("pt"))
      )
        referenced.push({ kind: "city", name: null, place: city, text: city });
    for (const question of ai.questions) {
      const owner = referenced.find((r) => r.kind === "name" && !r.text);
      if (owner) owner.text = question;
      else if (!has("question", question))
        referenced.push({ kind: "question", name: null, place: null, text: question });
    }
  }
  const readsChat =
    block.readsChat || ai.readsChat || type === "CHAT_READING" || type === "CHAT_RESPONSE";
  return {
    ...block,
    type,
    interaction:
      expects || type === "CHAT_READING" || type === "CHAT_RESPONSE"
        ? interaction === "NONE" && expects
          ? "SHORT_ANSWER"
          : interaction
        : type === "CONTENT" || type === "TECHNICAL" || type === "TRANSITION" || type === "OTHER"
          ? "NONE"
          : "REACTION",
    expectsResponse: expects && !ai.rhetorical,
    rhetorical: ai.rhetorical || (block.rhetorical && !changed),
    readsChat,
    referenced,
    keyword: block.keyword ?? (ai.keyword ? ai.keyword.toUpperCase() : null),
    confidence:
      Math.round(
        ((changed
          ? ai.confidence
          : Math.max(block.confidence, (block.confidence + ai.confidence) / 2)) ||
          block.confidence) * 100,
      ) / 100,
    source: changed ? "ia" : "ambos",
  };
}

export async function refineBlocksWithAi(
  blocks: SemanticBlock[],
  hostName: string | null = null,
): Promise<{ blocks: SemanticBlock[]; refined: number }> {
  if (!isConfigured()) return { blocks, refined: 0 };
  const speech = blocks.filter((b) => b.type !== "SILENCE");
  const byId = new Map(blocks.map((b) => [b.id, b] as const));
  const hostFirst = hostName?.trim().split(/\s+/)[0]?.toLocaleLowerCase("pt") ?? "";
  let refined = 0;
  for (let index = 0; index < speech.length; index += BATCH) {
    const chunk = speech.slice(index, index + BATCH);
    try {
      for (const ai of await askBatch(chunk, hostName)) {
        const block = byId.get(ai.id);
        if (!block) continue;
        // O apresentador nunca é alguém do chat, diga a IA o que disser.
        const names = hostFirst
          ? ai.names.filter((n) => n.trim().split(/\s+/)[0]?.toLocaleLowerCase("pt") !== hostFirst)
          : ai.names;
        byId.set(ai.id, mergeClassification(block, { ...ai, names }));
        refined += 1;
      }
    } catch {
      /* as regras continuam a valer neste lote */
    }
  }
  return { blocks: blocks.map((b) => byId.get(b.id) ?? b), refined };
}

/** Os blocos desta versão: os guardados, ou feitos agora (regras e, se pedido, IA). */
export async function ensureVersionBlocks(
  version: TranscriptVersion,
  options: { ai: boolean; force?: boolean; hostName?: string | null } = { ai: false },
): Promise<{ blocks: SemanticBlock[]; refined: number; fresh: boolean }> {
  const saved = (version.blocks ?? []) as SemanticBlock[];
  // Blocos guardados só pelas regras (uma leitura sem IA passou primeiro) ainda levam a afinação da IA,
  // a partir das regras actuais (as guardadas podem ser de uma versão anterior das regras).
  const refinedBefore = saved.some((b) => b.source !== "regras");
  if (saved.length > 0 && !options.force && (!options.ai || refinedBefore))
    return { blocks: saved, refined: 0, fresh: false };
  const rules = buildSemanticBlocks(version.sentences);
  if (rules.length === 0) return { blocks: [], refined: 0, fresh: true };
  const result = options.ai
    ? await refineBlocksWithAi(rules, options.hostName ?? null)
    : { blocks: rules, refined: 0 };
  // Um bloco que a IA passou a «espera resposta» sem a regra ter visto o pedido: as respostas contam do
  // fim da frase que pergunta, não do fim do bloco.
  const byId = new Map(version.sentences.map((s) => [s.id, s] as const));
  for (const block of result.blocks) {
    if (!block.expectsResponse || block.cueEndMs != null) continue;
    const sentences = block.sentenceIds.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
    const cue = cueEndFor(sentences);
    if (cue != null && cue < block.endMs) block.cueEndMs = cue;
  }
  await engine.saveVersionBlocks(version.id, result.blocks);
  return { ...result, fresh: true };
}
