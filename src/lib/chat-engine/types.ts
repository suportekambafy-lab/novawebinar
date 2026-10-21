/**
 * Motor do chat programado: a fala do apresentador em blocos com sentido,
 * cada bloco com o que espera do público, e as mensagens do chat ligadas a
 * esses blocos por uma dependência explícita (antes, depois ou livre).
 *
 * Tudo em milissegundos. Nada aqui conhece a IA nem a base de dados.
 */

export const BLOCK_TYPES = [
  "CONTENT",
  "QUESTION_TO_AUDIENCE",
  "COMMENT_REQUEST",
  "FEEDBACK_REQUEST",
  "POLL",
  "CHAT_READING",
  "CHAT_RESPONSE",
  "SOCIAL_PROOF",
  "EMOTIONAL_MOMENT",
  "CTA",
  "OFFER",
  "STORY",
  "TRANSITION",
  "TECHNICAL",
  "SILENCE",
  "OTHER",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const INTERACTION_TYPES = [
  "YES_NO",
  "NUMBER",
  "EMOJI",
  "LOCATION",
  "KEYWORD",
  "NAME",
  "SHORT_ANSWER",
  "LONG_ANSWER",
  "REACTION",
  "NONE",
] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

/** Quando é que a mensagem pode existir em relação ao bloco. */
export type Dependency = "BEFORE" | "AFTER" | "INDEPENDENT";

/** Algo que o apresentador leu ou citou do chat. */
export type ReferencedItem = {
  kind: "name" | "city" | "question" | "message";
  /** Nome dito pelo apresentador, quando o disse. */
  name: string | null;
  /** Cidade ou país ligado a este item ("a Mariana de Luanda"). */
  place: string | null;
  /** O conteúdo lido (pergunta, cidade, frase), quando existe. */
  text: string;
};

export type SemanticBlock = {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  sentenceIds: string[];
  type: BlockType;
  /** 0 a 1. */
  confidence: number;
  interaction: InteractionType;
  expectsResponse: boolean;
  rhetorical: boolean;
  readsChat: boolean;
  referenced: ReferencedItem[];
  /** Palavra pedida ("EU", "QUERO"), quando o apresentador a pede. */
  keyword: string | null;
  source: "regras" | "ia" | "ambos";
  /** Silêncio depois deste bloco, em ms. */
  gapAfterMs: number;
  /**
   * Fim da frase que faz o pedido ou a pergunta, quando o bloco a tem: é a partir daqui que as
   * respostas podem chegar (não do fim do bloco, que pode continuar mais uns segundos).
   */
  cueEndMs?: number;
};

export type OfferContext = "antes" | "depois" | "desconhecido";

export type InteractionSlot = {
  id: string;
  blockId: string;
  blockType: BlockType;
  dependency: Dependency;
  interaction: InteractionType;
  blockStartMs: number;
  blockEndMs: number;
  /** Fim do pedido ou da pergunta dentro do bloco: as respostas contam a partir daqui. */
  cueEndMs?: number;
  windowStartMs: number;
  windowEndMs: number;
  minComments: number;
  maxComments: number;
  /** Interacção forte: a cascata pode ir até 20 a 30 segundos. */
  strong: boolean;
  referenced: ReferencedItem[];
  keyword: string | null;
  /** A fala do bloco, curta. */
  speech: string;
  /** O que foi dito nos 30 a 90 segundos antes. */
  context: string;
  confidence: number;
  needsReview: boolean;
  offerContext: OfferContext;
  reason: string;
};

export type EngineComment = {
  id: string;
  atMs: number;
  author: string;
  message: string;
  slotId: string | null;
  blockId: string | null;
  dependency: Dependency;
  profileId?: string | null;
  /** Nome de quem esta mensagem responde ("@Nome"). */
  replyTo?: string | null;
  confidence: number;
};
