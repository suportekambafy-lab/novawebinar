/**
 * Método Nova, parte 2: o guião.
 *
 * Antes de a IA escrever uma palavra, o guião decide tudo o que não é texto: quem escreve, ao
 * milissegundo, a que oportunidade responde, com que intenção, com que tamanho, e a quem responde.
 * A IA recebe linhas e devolve só a mensagem de cada uma. Assim os tempos, os nomes e a presença
 * nunca dependem de a IA «se lembrar».
 *
 * Regras do guião:
 * - ninguém escreve antes de chegar nem depois de sair;
 * - quem responde a um pedido fica ocupado uns segundos: não responde a dois pedidos ao mesmo tempo;
 * - as respostas a um pedido têm uma cauda (até 60 a 90 s): não acabam todas em 15 s;
 * - numa cascata de respostas, às vezes alguém responde a outra pessoa («@Nome»);
 * - os nomes lidos ou nomeados pelo apresentador escrevem (as mensagens obrigatórias);
 * - as mensagens soltas rodam de intenção (dúvida, identificação, descoberta, objecção, intenção), em
 *   função do bloco e de a oferta já existir ou não;
 * - quem chega durante o trecho pode cumprimentar.
 */
import { memberByName, present, type CastMember } from "./cast";
import { FIRST_ANSWER_MIN_MS, placeSlot, rng } from "./timing";
import type { BlockType, Dependency, InteractionSlot, InteractionType } from "./types";

export type ScriptIntent =
  | "chegada"
  | "presenca"
  | "lida"
  | "resposta"
  | "reaccao"
  | "solta"
  | "replica";

export type FreeTopic = "duvida" | "identificacao" | "descoberta" | "objecao" | "intencao" | "comentario";

export type ScriptLine = {
  id: string;
  atMs: number;
  memberId: string;
  author: string;
  slotId: string | null;
  blockId: string | null;
  blockType: BlockType | null;
  dependency: Dependency;
  interaction: InteractionType;
  intent: ScriptIntent;
  /** O que a IA deve escrever, em palavras. */
  need: string;
  /** Texto obrigatório (o que o apresentador vai ler), quando existe. */
  mustText: string | null;
  /** Nome a quem responde («@Nome»), quando é uma réplica. */
  replyTo: string | null;
  /** A fala a que a linha se liga quando não vem de uma oportunidade (momento ou pedido do mapa). */
  anchorMs?: number | null;
  maxWords: number;
  kind: "provoca" | "responde" | "reage" | "espontaneo";
  windowStartMs: number | null;
  windowEndMs: number | null;
  confidence: number;
  reason: string;
};

/** O mapa do webinar (modo Inteligente), em segundos, quando existe. */
export type ScriptIntel = {
  moments?: readonly { from: number; to: number; topic: string; summary: string; novelty: number; reactionUntil: number }[];
  audienceState?: readonly {
    at: number;
    estimatedConfusion: number;
    estimatedExcitement: number;
    estimatedPurchaseIntent: number;
    estimatedObjection: number;
    chatEnergy: number;
  }[];
  prompts?: readonly { at: number; ask: string; expects: string; keyword: string; intensity: number }[];
};

export type ScriptOptions = {
  fromMs: number;
  toMs: number;
  seed: number;
  /** Mensagens por minuto nas partes livres. */
  perMinute: number;
  offerStartMs: number | null;
  /** Quem já escreveu antes do trecho (continuidade entre trechos). */
  existing: readonly { atMs: number; author: string }[];
  /** O mapa do webinar: estado da audiência, momentos fortes e pedidos vistos pela IA. */
  intel?: ScriptIntel | null | undefined;
};

/** O estado estimado da audiência num instante: o ponto do mapa mais próximo. */
export function audienceAt(intel: ScriptIntel | null | undefined, ms: number) {
  const points = intel?.audienceState ?? [];
  if (points.length === 0) return null;
  let best = points[0]!;
  for (const p of points) if (Math.abs(p.at * 1000 - ms) < Math.abs(best.at * 1000 - ms)) best = p;
  return best;
}

/** Quanto o chat está vivo neste instante, em relação ao normal (0,6 a 1,5). */
export function energyAt(intel: ScriptIntel | null | undefined, ms: number): number {
  const state = audienceAt(intel, ms);
  if (!state) return 1;
  return Math.max(0.6, Math.min(1.5, state.chatEnergy / 50));
}

const EXPECTS_TO_INTERACTION: Record<string, InteractionType> = {
  cidade: "LOCATION",
  "sim-nao": "YES_NO",
  "palavra-chave": "KEYWORD",
  numero: "NUMBER",
  duvida: "LONG_ANSWER",
  experiencia: "SHORT_ANSWER",
  interesse: "SHORT_ANSWER",
  livre: "SHORT_ANSWER",
};

/** Fracção de quem está na sala que responde a cada tipo de pedido. */
const RESPONSE_RATE: Partial<Record<BlockType, number>> = {
  COMMENT_REQUEST: 0.32,
  POLL: 0.3,
  FEEDBACK_REQUEST: 0.28,
  QUESTION_TO_AUDIENCE: 0.2,
  CTA: 0.14,
  OFFER: 0.1,
  SOCIAL_PROOF: 0.1,
  EMOTIONAL_MOMENT: 0.1,
  STORY: 0.05,
  CHAT_READING: 0.04,
  CHAT_RESPONSE: 0.04,
};

/** Cauda das respostas depois da janela curta, em ms. */
const TAIL_MS = 45_000;
const STRONG_TAIL_MS = 70_000;
/** Depois de responder a um pedido, a pessoa fica uns segundos sem responder a outro. */
const BUSY_AFTER_ANSWER_MS = 40_000;
const BUSY_AFTER_REACTION_MS = 20_000;
const BUSY_AFTER_FREE_MS = 25_000;

function words(interaction: InteractionType, length: CastMember["length"], random: () => number) {
  const pick = (lo: number, hi: number) => lo + Math.round(random() * (hi - lo));
  switch (interaction) {
    case "YES_NO":
      return pick(1, 4);
    case "NUMBER":
      return pick(1, 4);
    case "EMOJI":
      return 1;
    case "KEYWORD":
      return pick(1, 2);
    case "LOCATION":
      return pick(1, 5);
    case "NAME":
      return pick(1, 4);
    case "LONG_ANSWER":
      return pick(6, 22);
    default:
      return length === "curto" ? pick(2, 6) : length === "longo" ? pick(8, 20) : pick(3, 12);
  }
}

function kindFor(dependency: Dependency, blockType: BlockType | null): ScriptLine["kind"] {
  if (dependency === "BEFORE") return "provoca";
  if (dependency === "AFTER")
    return blockType === "QUESTION_TO_AUDIENCE" ||
      blockType === "COMMENT_REQUEST" ||
      blockType === "FEEDBACK_REQUEST" ||
      blockType === "POLL"
      ? "responde"
      : "reage";
  return "espontaneo";
}

/**
 * A intenção de uma mensagem solta, em função do bloco, de a oferta já existir e do estado estimado
 * da audiência (confusa → dúvida; com objecções depois do preço → objecção; decidida → intenção).
 */
export function freeTopic(
  blockType: BlockType | null,
  afterOffer: boolean,
  turn: number,
  state?: ReturnType<typeof audienceAt>,
): FreeTopic {
  if (state) {
    if (state.estimatedConfusion >= 55 && turn % 2 === 0) return "duvida";
    if (afterOffer && state.estimatedObjection >= 55 && turn % 3 !== 2) return "objecao";
    if (afterOffer && state.estimatedPurchaseIntent >= 60 && turn % 2 === 0) return "intencao";
    if (state.estimatedExcitement >= 60 && turn % 3 === 0) return "descoberta";
  }
  if (afterOffer) return (["intencao", "duvida", "objecao", "comentario", "intencao"] as const)[turn % 5]!;
  switch (blockType) {
    case "STORY":
    case "EMOTIONAL_MOMENT":
      return (["identificacao", "comentario", "identificacao", "duvida"] as const)[turn % 4]!;
    case "TECHNICAL":
      return (["duvida", "duvida", "descoberta"] as const)[turn % 3]!;
    case "SOCIAL_PROOF":
      return (["descoberta", "duvida", "identificacao"] as const)[turn % 3]!;
    default:
      return (["descoberta", "duvida", "comentario", "identificacao", "duvida", "comentario"] as const)[
        turn % 6
      ]!;
  }
}

const TOPIC_TEXT: Record<FreeTopic, string> = {
  duvida: "uma dúvida genuína sobre o que acabou de ser dito (só sobre o que já foi dito)",
  identificacao: "identifica-se com o que foi dito (a própria situação, em poucas palavras)",
  descoberta: "percebeu agora algo que não sabia, nas palavras dela",
  objecao: "uma hesitação ou objecção honesta (tempo, dinheiro, se serve para o caso dela)",
  intencao: "mostra que está a pensar entrar, sem exagero",
  comentario: "um comentário solto sobre o que está a ser dito, coloquial",
};

export function buildScript(
  slots: readonly InteractionSlot[],
  cast: readonly CastMember[],
  options: ScriptOptions,
): ScriptLine[] {
  const random = rng(options.seed);
  const lines: ScriptLine[] = [];
  /** Até quando cada pessoa está «ocupada» (acabou de escrever). */
  const busyUntil = new Map<string, number>();
  for (const e of options.existing) {
    const m = memberByName(cast, e.author);
    if (m) busyUntil.set(m.id, Math.max(busyUntil.get(m.id) ?? 0, e.atMs + BUSY_AFTER_FREE_MS));
  }
  let counter = 0;
  const nextId = () => {
    counter += 1;
    return `L${counter}`;
  };
  let freeTurn = 0;

  const available = (atMs: number, exclude: ReadonlySet<string>) =>
    present(cast, atMs).filter((m) => !exclude.has(m.id) && (busyUntil.get(m.id) ?? 0) <= atMs);

  /** Escolhe quem escreve: ponderado pela actividade, entre quem está livre. Se ninguém, quem está. */
  const pick = (atMs: number, exclude: ReadonlySet<string>): CastMember | null => {
    let pool = available(atMs, exclude);
    if (pool.length === 0) pool = present(cast, atMs).filter((m) => !exclude.has(m.id));
    if (pool.length === 0) return null;
    const total = pool.reduce((sum, m) => sum + m.activity, 0);
    let r = random() * total;
    for (const m of pool) {
      r -= m.activity;
      if (r <= 0) return m;
    }
    return pool[pool.length - 1]!;
  };

  /** Quando cada pessoa escreveu, para as chegadas não colidirem com linhas já marcadas. */
  const writtenAt = new Map<string, number[]>();
  const push = (line: Omit<ScriptLine, "id">) => {
    lines.push({ id: nextId(), ...line });
    writtenAt.set(line.memberId, [...(writtenAt.get(line.memberId) ?? []), line.atMs]);
  };
  const freeAround = (memberId: string, atMs: number, gapMs: number) =>
    !(writtenAt.get(memberId) ?? []).some((t) => Math.abs(t - atMs) < gapMs);

  const ordered = [...slots]
    .filter((s) => s.windowEndMs >= options.fromMs - 1000 && s.windowStartMs <= options.toMs + 1000)
    .sort((a, b) => a.windowStartMs - b.windowStartMs);

  // Onde começa o próximo pedido ao público: as caudas de respostas não passam por cima dele.
  const asks = ordered.filter((s) => s.dependency === "AFTER" && s.minComments > 0 && s.strong);

  for (const slot of ordered) {
    const afterOffer = options.offerStartMs != null && slot.blockStartMs >= options.offerStartMs;

    if (slot.dependency === "BEFORE") {
      const names = slot.referenced.filter((r) => r.kind === "name");
      const others = slot.referenced.filter((r) => r.kind !== "name");
      const count = Math.max(slot.minComments, names.length + others.length, 1);
      const times = placeSlot(slot, count, options.seed + counter);
      const usedHere = new Set<string>();
      let index = 0;
      for (const item of names) {
        const member = memberByName(cast, item.name!);
        const atMs = times[index] ?? slot.windowStartMs;
        index += 1;
        const author = member?.name ?? item.name!;
        const id = member?.id ?? `x-${item.name}`;
        usedHere.add(id);
        busyUntil.set(id, atMs + BUSY_AFTER_REACTION_MS);
        push({
          atMs,
          memberId: id,
          author,
          slotId: slot.id,
          blockId: slot.blockId,
          blockType: slot.blockType,
          dependency: "BEFORE",
          interaction: "NONE",
          intent: slot.id.endsWith("_presenca") ? "presenca" : "lida",
          need: item.text
            ? `escreve exactamente o que o apresentador vai ler: "${item.text}"`
            : item.place
              ? `diz de onde vê (${item.place}), curto`
              : slot.id.endsWith("_presenca")
                ? "uma mensagem curta e natural de quem está na sala (cumprimento, presença, ou o que o apresentador refere sobre ela a seguir)"
                : `escreve o que o apresentador cita ou resume a seguir (fala: "${slot.speech.slice(0, 160)}")`,
          mustText: item.text || null,
          replyTo: null,
          maxWords: item.text ? Math.max(1, item.text.split(/\s+/).length + 2) : 8,
          kind: "provoca",
          windowStartMs: slot.windowStartMs,
          windowEndMs: slot.windowEndMs,
          confidence: slot.confidence,
          reason: slot.reason,
        });
      }
      for (const item of others) {
        const atMs = times[index] ?? slot.windowStartMs;
        index += 1;
        const member = pick(atMs, usedHere);
        if (!member) continue;
        usedHere.add(member.id);
        busyUntil.set(member.id, atMs + BUSY_AFTER_REACTION_MS);
        push({
          atMs,
          memberId: member.id,
          author: member.name,
          slotId: slot.id,
          blockId: slot.blockId,
          blockType: slot.blockType,
          dependency: "BEFORE",
          interaction: "NONE",
          intent: "lida",
          need:
            item.kind === "question"
              ? `pergunta exactamente isto (nas suas palavras, mesmo sentido): "${item.text}"`
              : item.kind === "city"
                ? `diz que vê de ${item.text}`
                : item.text
                  ? `escreve exactamente o que o apresentador vai ler: "${item.text}"`
                  : `a mensagem que o apresentador vai ler a seguir (fala: "${slot.speech.slice(0, 160)}")`,
          mustText: item.text || null,
          replyTo: null,
          maxWords: item.text ? Math.max(3, item.text.split(/\s+/).length + 3) : 10,
          kind: "provoca",
          windowStartMs: slot.windowStartMs,
          windowEndMs: slot.windowEndMs,
          confidence: slot.confidence,
          reason: slot.reason,
        });
      }
      continue;
    }

    if (slot.dependency === "AFTER") {
      const here = present(cast, slot.blockEndMs).length;
      const rate = RESPONSE_RATE[slot.blockType] ?? 0.08;
      const expected = slot.referenced.filter((r) => r.kind === "name");
      const wanted = Math.round(here * rate * (0.8 + random() * 0.5) * energyAt(options.intel, slot.blockEndMs));
      let count = Math.max(slot.minComments, Math.min(slot.maxComments, wanted));
      // Quem é lido agradece: uma pessoa, às vezes duas. Quem foi nomeado num pedido responde sempre.
      if (slot.id.endsWith("_agradece")) count = Math.min(Math.max(1, expected.length), random() < 0.3 ? 2 : 1);
      else count = Math.max(count, expected.length);
      if (count <= 0) continue;
      const usedHere = new Set<string>();
      const authors: CastMember[] = [];
      for (const item of expected) {
        if (authors.length >= count) break;
        const member = memberByName(cast, item.name!);
        if (member && !usedHere.has(member.id)) {
          usedHere.add(member.id);
          authors.push(member);
        }
      }
      // Tempos: a maior parte na janela curta, o resto numa cauda, sem passar o próximo pedido.
      const short = Math.max(authors.length, Math.ceil(count * 0.65));
      const tailCount = count - short;
      const times = placeSlot(slot, short, options.seed + counter);
      const nextAsk = asks.find((s) => s.blockStartMs > slot.blockEndMs + 2000);
      const tailLimit = Math.min(
        slot.windowEndMs + (slot.strong ? STRONG_TAIL_MS : TAIL_MS),
        nextAsk ? (nextAsk.cueEndMs ?? nextAsk.blockEndMs) + FIRST_ANSWER_MIN_MS - 1000 : Number.MAX_SAFE_INTEGER,
        options.toMs + 999,
      );
      let previous = times[times.length - 1] ?? slot.windowEndMs;
      for (let i = 0; i < tailCount; i += 1) {
        const gap = 2500 + Math.pow(random(), 0.6) * 12_000;
        const t = previous + gap;
        if (t > tailLimit) break;
        times.push(Math.round(t));
        previous = t;
      }
      const busyAfter = kindFor("AFTER", slot.blockType) === "responde" ? BUSY_AFTER_ANSWER_MS : BUSY_AFTER_REACTION_MS;
      const written: { id: string; author: string; atMs: number; memberId: string }[] = [];
      times.forEach((atMs, index) => {
        const member = authors[index] ?? pick(atMs, usedHere);
        if (!member) return;
        usedHere.add(member.id);
        busyUntil.set(member.id, atMs + busyAfter);
        const kind = kindFor("AFTER", slot.blockType);
        const late = index >= short;
        const id = nextId();
        lines.push({
          id,
          atMs,
          memberId: member.id,
          author: member.name,
          slotId: slot.id,
          blockId: slot.blockId,
          blockType: slot.blockType,
          dependency: "AFTER",
          interaction: slot.interaction,
          intent: kind === "responde" ? "resposta" : "reaccao",
          need:
            kind === "responde"
              ? `${slot.reason}${late ? " (chega atrasada, sem repetir o que os outros já disseram)" : index === 0 ? " (a primeira: curta e imediata)" : ""}`
              : `${slot.reason}${late ? " (um pouco depois dos outros)" : ""}`,
          mustText: null,
          replyTo: null,
          maxWords: words(slot.interaction, member.length, random),
          kind,
          windowStartMs: slot.windowStartMs,
          windowEndMs: slot.windowEndMs,
          confidence: slot.confidence,
          reason: slot.reason,
        });
        written.push({ id, author: member.name, atMs, memberId: member.id });
        writtenAt.set(member.id, [...(writtenAt.get(member.id) ?? []), atMs]);
      });
      // Uma réplica a alguém da cascata, quando há conversa possível (não a números nem a sim/não).
      const talkative =
        slot.interaction === "SHORT_ANSWER" ||
        slot.interaction === "LONG_ANSWER" ||
        slot.interaction === "LOCATION" ||
        slot.interaction === "REACTION";
      if (talkative && written.length >= 4 && random() < 0.55) {
        const target = written[Math.floor(random() * Math.min(3, written.length))]!;
        const atMs = Math.round(target.atMs + 5000 + random() * 12_000);
        if (atMs <= tailLimit) {
          const member = pick(atMs, new Set([...usedHere, target.memberId]));
          if (member) {
            busyUntil.set(member.id, atMs + BUSY_AFTER_REACTION_MS);
            push({
              atMs,
              memberId: member.id,
              author: member.name,
              slotId: slot.id,
              blockId: slot.blockId,
              blockType: slot.blockType,
              dependency: "AFTER",
              interaction: "REACTION",
              intent: "replica",
              need: `responde a ${target.author} (começa por "@${target.author.split(" ")[0]}"): concorda, acrescenta ou pergunta algo curto sobre o que ${target.author.split(" ")[0]} escreveu`,
              mustText: null,
              replyTo: target.author,
              maxWords: 10,
              kind: kindFor("AFTER", slot.blockType),
              windowStartMs: slot.windowStartMs,
              windowEndMs: slot.windowEndMs,
              confidence: slot.confidence,
              reason: `responde a ${target.author}`,
            });
          }
        }
      }
      continue;
    }

    // Livre: poucas, soltas, só sobre o que já foi dito, com intenções a rodar.
    {
      const minutes = Math.max(0, slot.windowEndMs - slot.windowStartMs) / 60_000;
      const here = present(cast, slot.windowStartMs).length;
      const scale = Math.min(1, here / 20) * energyAt(options.intel, slot.windowStartMs);
      const max = Math.min(slot.maxComments, Math.round(minutes * options.perMinute * 0.5 * scale + random()));
      if (max <= 0) continue;
      const times = placeSlot(slot, max, options.seed + counter);
      const usedHere = new Set<string>();
      for (const atMs of times) {
        const member = pick(atMs, usedHere);
        if (!member) continue;
        usedHere.add(member.id);
        busyUntil.set(member.id, atMs + BUSY_AFTER_FREE_MS);
        // Nos primeiros 90 s ninguém «descobre» nada: as soltas são chegadas e expectativa. Numa fala
        // curta (menos de 12 s) também não há descoberta possível.
        const opening = atMs < 90_000;
        const shortSpeech = slot.blockEndMs - slot.blockStartMs < 12_000;
        let topic: FreeTopic =
          slot.blockType === "SILENCE"
            ? "comentario"
            : freeTopic(slot.blockType, afterOffer, freeTurn, audienceAt(options.intel, atMs));
        if (shortSpeech && (topic === "descoberta" || topic === "duvida")) topic = "comentario";
        freeTurn += 1;
        push({
          atMs,
          memberId: member.id,
          author: member.name,
          slotId: slot.id,
          blockId: slot.blockId,
          blockType: slot.blockType,
          dependency: "INDEPENDENT",
          interaction: "NONE",
          intent: opening ? "chegada" : "solta",
          need: opening
            ? "chegada à sala: cumprimento curto, presença ou expectativa ligada ao tema (nunca diz de onde vê, a não ser que o apresentador o tenha pedido)"
            : slot.blockType === "SILENCE"
              ? "uma mensagem solta durante a pausa do apresentador, sem reagir a nada (uma dúvida que ficou, ou um comentário leve)"
              : TOPIC_TEXT[topic],
          mustText: null,
          replyTo: null,
          maxWords: words("NONE", member.length, random),
          kind: "espontaneo",
          windowStartMs: slot.windowStartMs,
          windowEndMs: slot.windowEndMs,
          confidence: slot.confidence,
          reason: `${slot.reason} (${topic})`,
        });
      }
    }
  }

  // O mapa do webinar (modo Inteligente) acrescenta o que os blocos não vêem.
  if (options.intel) {
    const asksCovered = (ms: number) =>
      ordered.some(
        (s) => s.dependency === "AFTER" && s.minComments > 0 && Math.abs((s.cueEndMs ?? s.blockEndMs) - ms) <= 12_000,
      );
    const reactionsCovered = (ms: number) =>
      ordered.some((s) => s.dependency === "AFTER" && Math.abs(s.blockEndMs - ms) <= 8000);

    // Pedidos ao público que a IA viu e o classificador não: ficam com respostas na mesma.
    for (const prompt of options.intel.prompts ?? []) {
      const atMs = prompt.at * 1000;
      if (atMs < options.fromMs || atMs > options.toMs || prompt.intensity < 50 || asksCovered(atMs)) continue;
      const here = present(cast, atMs).length;
      const count = Math.max(2, Math.min(8, Math.round(here * 0.2 * energyAt(options.intel, atMs))));
      const interaction = EXPECTS_TO_INTERACTION[prompt.expects] ?? "SHORT_ANSWER";
      const pseudo = {
        dependency: "AFTER" as const,
        blockStartMs: Math.max(0, atMs - 4000),
        blockEndMs: atMs,
        cueEndMs: atMs,
        windowStartMs: atMs + FIRST_ANSWER_MIN_MS,
        windowEndMs: atMs + 28_000,
        strong: prompt.intensity >= 70,
      };
      const times = placeSlot(pseudo, count, options.seed + counter + 7);
      const usedHere = new Set<string>();
      times.forEach((t, index) => {
        if (t > options.toMs) return;
        const member = pick(t, usedHere);
        if (!member) return;
        usedHere.add(member.id);
        busyUntil.set(member.id, t + BUSY_AFTER_ANSWER_MS);
        push({
          atMs: t,
          memberId: member.id,
          author: member.name,
          slotId: null,
          blockId: null,
          blockType: "QUESTION_TO_AUDIENCE",
          dependency: "AFTER",
          interaction,
          intent: "resposta",
          need: `responde ao pedido do apresentador: "${prompt.ask.slice(0, 140)}"${prompt.keyword ? ` (a palavra pedida: "${prompt.keyword}")` : ""}${index === 0 ? " (a primeira: curta e imediata)" : ""}`,
          mustText: null,
          replyTo: null,
          anchorMs: atMs,
          maxWords: words(interaction, member.length, random),
          kind: "responde",
          windowStartMs: pseudo.windowStartMs,
          windowEndMs: pseudo.windowEndMs,
          confidence: Math.min(0.9, prompt.intensity / 100),
          reason: "responde ao pedido do apresentador (visto no mapa do webinar)",
        });
      });
    }

    // Ideias fortes («momentos aha»): reacções logo a seguir a a ideia fechar.
    for (const moment of options.intel.moments ?? []) {
      const toMs = moment.to * 1000;
      if (toMs < options.fromMs || toMs > options.toMs || moment.novelty < 55 || reactionsCovered(toMs)) continue;
      const here = present(cast, toMs).length;
      const count = Math.max(1, Math.min(4, Math.round(here * 0.08 * (moment.novelty / 70) * energyAt(options.intel, toMs))));
      const until = Math.min(Math.max(toMs + 6000, moment.reactionUntil * 1000), toMs + 25_000, options.toMs);
      const usedHere = new Set<string>();
      let t = toMs + 2000 + random() * 3000;
      for (let i = 0; i < count && t <= until; i += 1) {
        const member = pick(t, usedHere);
        if (!member) break;
        usedHere.add(member.id);
        busyUntil.set(member.id, t + BUSY_AFTER_REACTION_MS);
        push({
          atMs: Math.round(t),
          memberId: member.id,
          author: member.name,
          slotId: null,
          blockId: null,
          blockType: "CONTENT",
          dependency: "AFTER",
          interaction: "REACTION",
          intent: "reaccao",
          need: `reage à ideia que o apresentador acabou de fechar: "${moment.summary.slice(0, 160)}" (${moment.topic}); nas palavras dela, sem repetir a frase dele`,
          mustText: null,
          replyTo: null,
          anchorMs: toMs,
          maxWords: words("REACTION", member.length, random),
          kind: "reage",
          windowStartMs: toMs + 2000,
          windowEndMs: until,
          confidence: 0.7,
          reason: `reage ao momento «${moment.topic}»`,
        });
        t += 2500 + Math.pow(random(), 0.7) * 9000;
      }
    }
  }

  // Quem chega cumprimenta. A sala abre vibrante: quem já lá está nos primeiros 20 s escreve quase
  // sempre (olá, boa noite, ansiosa), logo 1 a 8 s depois de entrar, sem esperar que o apresentador
  // fale; nos primeiros 2 minutos, dois em cada três; depois, metade, com mais calma.
  for (const m of cast) {
    if (m.arrivalMs < options.fromMs || m.arrivalMs > options.toMs) continue;
    const opening = m.arrivalMs < 20_000;
    const early = m.arrivalMs < 120_000;
    const chance = m.role === "aluna" ? 0.9 : opening ? 0.85 : early ? 0.65 : 0.5;
    if (random() >= chance) continue;
    const delay = opening ? 1000 + random() * 7000 : early ? 3000 + random() * 17_000 : 5000 + random() * 35_000;
    const atMs = Math.round(m.arrivalMs + delay);
    if (atMs > options.toMs) continue;
    // As linhas das oportunidades já estão marcadas: a chegada só entra se não colar a uma delas.
    if (!freeAround(m.id, atMs, 12_000)) continue;
    push({
      atMs,
      memberId: m.id,
      author: m.name,
      slotId: null,
      blockId: null,
      blockType: null,
      dependency: "INDEPENDENT",
      interaction: "NONE",
      intent: "chegada",
      need: opening
        ? m.role === "aluna"
          ? "a sala acabou de abrir e ela já conhece a apresentadora: cumprimento caloroso e curto (olá, boa noite, «cheguei!», «ansiosa»), sem dizer de onde vê"
          : "a sala acabou de abrir, o apresentador ainda mal falou: olá, boa noite, «presente», «ansioso(a)», «vamos lá», «primeira vez aqui», sem dizer de onde vê"
        : early
          ? "acabou de entrar: cumprimento curto, presença ou expectativa ligada ao tema (nunca diz de onde vê, a não ser que o apresentador o tenha pedido)"
          : "chegou atrasada: cumprimento curto, talvez pergunta se perdeu muito",
      mustText: null,
      replyTo: null,
      maxWords: opening ? 5 : 6,
      kind: "espontaneo",
      windowStartMs: null,
      windowEndMs: null,
      confidence: 0.6,
      reason: opening ? "a sala acabou de abrir" : "acabou de entrar na sala",
    });
    // Quem chega atrasado às vezes recebe resposta de alguém que já lá está («@Nome ainda vai no início»).
    if (!early && random() < 0.5) {
      const replyAt = Math.round(atMs + 8000 + random() * 17_000);
      if (replyAt > options.toMs) continue;
      const helper = pick(replyAt, new Set([m.id]));
      if (!helper || !freeAround(helper.id, replyAt, 10_000)) continue;
      busyUntil.set(helper.id, replyAt + BUSY_AFTER_REACTION_MS);
      push({
        atMs: replyAt,
        memberId: helper.id,
        author: helper.name,
        slotId: null,
        blockId: null,
        blockType: null,
        dependency: "INDEPENDENT",
        interaction: "NONE",
        intent: "replica",
        need: `responde a ${m.name.split(" ")[0]} que acabou de chegar (começa por "@${m.name.split(" ")[0]}"): diz em poucas palavras onde vai a aula ou que ainda vai a tempo`,
        mustText: null,
        replyTo: m.name,
        maxWords: 10,
        kind: "espontaneo",
        windowStartMs: null,
        windowEndMs: null,
        confidence: 0.6,
        reason: `responde a ${m.name}, que chegou atrasado`,
      });
    }
  }

  // Ordem, e nunca duas no mesmo instante.
  lines.sort((a, b) => a.atMs - b.atMs);
  let previous = -Infinity;
  for (const line of lines) {
    if (line.atMs - previous < 700) {
      const latest = line.dependency === "BEFORE" && line.windowEndMs != null ? line.windowEndMs : Infinity;
      line.atMs = Math.min(latest, previous + 700 + Math.round(random() * 300));
    }
    previous = Math.max(previous, line.atMs);
  }
  return lines.filter((l) => l.atMs >= options.fromMs && l.atMs <= options.toMs + 999);
}

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * O que o apresentador está a fazer no instante da linha, para a IA escrever em conformidade: a pedir
 * e à espera, a ler o chat, a responder a alguém, a contar, a explicar, ou a sala a abrir.
 */
export function presenterState(line: ScriptLine, slot: InteractionSlot | null): string {
  if (line.intent === "chegada") return line.atMs < 20_000 ? "a sala está a abrir; o apresentador ainda mal falou" : "o apresentador está a falar; esta pessoa acabou de entrar";
  if (!slot) {
    if (line.intent === "resposta") return "o apresentador acabou de pedir e está à espera das respostas";
    if (line.intent === "reaccao") return "o apresentador acabou de fechar uma ideia forte";
    if (line.intent === "replica") return "o apresentador está a falar; esta pessoa responde a alguém que acabou de entrar";
    return "o apresentador está a explicar; ninguém pediu nada";
  }
  const cue = slot.cueEndMs ?? slot.blockEndMs;
  const since = Math.max(0, Math.round((line.atMs - cue) / 1000));
  switch (line.intent) {
    case "lida":
      return `o apresentador vai ler isto em voz alta daqui a ${Math.max(1, Math.round((slot.blockStartMs - line.atMs) / 1000))} s`;
    case "presenca":
      return `o apresentador vai nomear esta pessoa daqui a ${Math.max(1, Math.round((slot.blockStartMs - line.atMs) / 1000))} s`;
    case "resposta":
      return since <= 4
        ? "o apresentador acabou de pedir e está à espera das respostas"
        : since <= 20
          ? "o apresentador pediu há pouco e continua à espera; já há respostas no chat"
          : "o apresentador pediu há mais de 20 s e já seguiu em frente; esta resposta chega atrasada";
    case "replica":
      return line.replyTo && !line.slotId
        ? "o apresentador está a falar; esta pessoa responde a alguém que acabou de entrar"
        : "o chat está animado com as respostas; o apresentador continua";
    case "reaccao":
      if (slot.id.endsWith("_agradece")) return "o apresentador acabou de ler a mensagem desta pessoa em voz alta";
      return slot.blockType === "CHAT_READING" || slot.blockType === "CHAT_RESPONSE"
        ? "o apresentador acabou de ler ou responder ao chat"
        : `o apresentador acabou de ${slot.blockType === "STORY" ? "contar isto" : slot.blockType === "OFFER" || slot.blockType === "CTA" ? "apresentar isto" : "dizer isto"}`;
    default:
      return slot.blockType === "SILENCE" ? "o apresentador está em pausa, sem falar" : "o apresentador está a explicar; ninguém pediu nada";
  }
}

/** As linhas do guião em texto, para a IA escrever o que falta. */
export function describeScript(lines: readonly ScriptLine[], slots: readonly InteractionSlot[]): string {
  const slotById = new Map(slots.map((s) => [s.id, s] as const));
  return lines
    .map((line) => {
      const slot = line.slotId ? slotById.get(line.slotId) : null;
      const state = ` · [${presenterState(line, slot ?? null)}]`;
      const context =
        slot && (line.intent === "resposta" || line.intent === "reaccao" || line.intent === "replica")
          ? ` · fala a que responde (${clock(slot.blockStartMs)}–${clock(slot.blockEndMs)}): "${slot.speech.slice(0, 200)}"`
          : slot && (line.intent === "lida" || line.intent === "presenca")
            ? ` · o apresentador vai dizer às ${clock(slot.blockStartMs)}: "${slot.speech.slice(0, 200)}"`
            : "";
      const format =
        line.interaction !== "NONE" && line.interaction !== "REACTION"
          ? ` · formato: ${
              {
                YES_NO: "sim ou não",
                NUMBER: "um número",
                EMOJI: "um emoji",
                KEYWORD: `a palavra pedida${slot?.keyword ? ` ("${slot.keyword}")` : ""}`,
                LOCATION: "de onde vê",
                NAME: "o nome",
                SHORT_ANSWER: "resposta curta",
                LONG_ANSWER: "resposta longa",
              }[line.interaction]
            }`
          : "";
      const must = line.mustText ? ` · OBRIGATÓRIO: "${line.mustText}"` : "";
      return `${line.id} | ${clock(line.atMs)} | ${line.author} (${line.memberId}) | ${line.need}${format}${must} · máx. ${line.maxWords} ${line.maxWords === 1 ? "palavra" : "palavras"}${state}${context}`;
    })
    .join("\n");
}
