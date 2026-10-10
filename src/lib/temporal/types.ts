/**
 * Formato temporal interno da Novawebinar.
 *
 * Tudo aqui é normalizado e independente do fornecedor de transcrição.
 * Nenhuma outra parte do sistema (frases, momentos, eventos, geração,
 * validação ou interface) deve conhecer a AssemblyAI ou qualquer outro motor.
 *
 * Internamente o tempo é sempre em MILISSEGUNDOS.
 */

/** Grau de confiança temporal da transcrição em uso. */
export type TimestampPrecision =
  /** Tempo real de cada palavra, dado pelo motor de transcrição. */
  | "word"
  /** Tempo do bloco de áudio processado — não é precisão por palavra. */
  | "block"
  /** Legado: tempo calculado pelo tamanho do texto. Não serve para causalidade. */
  | "estimated";

export type NormalizedWord = {
  word: string;
  startMs: number;
  endMs: number;
  /** 0 a 1, quando o motor o fornece. */
  confidence: number | null;
  speakerId: string | null;
};

export type NormalizedSentence = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  wordIndexes: number[];
  speakerId: string | null;
  confidence: number | null;
};

export type SemanticMomentType =
  | "abertura"
  | "historia"
  | "ensino"
  | "prova"
  | "objecao"
  | "oferta"
  | "cta"
  | "outro";

export type TemporalSemanticMoment = {
  id: string;
  startMs: number;
  endMs: number;
  /** A partir daqui já faz sentido alguém reagir. */
  reactionWindowStartMs: number;
  reactionWindowEndMs: number;
  topic: string;
  summary: string;
  /** 0 a 100. */
  novelty: number;
  emotionalIntensity: number;
  informationDensity: number;
  momentType: SemanticMomentType;
  expectedReactions: string[];
  sourceSentenceIds: string[];
  /** Tópico a que este momento pertence (ver temporal/topics). */
  topicId?: string;
};


export type PresenterEventType =
  | "DIRECT_QUESTION"
  | "AUDIENCE_PROMPT"
  | "REQUEST_TO_TYPE"
  | "REQUEST_LOCATION"
  | "REQUEST_CONFIRMATION"
  | "RHETORICAL_QUESTION"
  | "CONTENT_REVELATION"
  | "STORY_BEAT"
  | "HUMOR"
  | "EMOTIONAL_BEAT"
  | "TECHNICAL_EXPLANATION"
  | "PROOF"
  | "OBJECTION"
  | "OFFER_TRANSITION"
  | "PRICE_REVEAL"
  | "BONUS"
  | "GUARANTEE"
  | "URGENCY"
  | "CTA"
  | "CHAT_REFERENCE"
  | "PRESENTER_READS_CHAT";

export type ExpectedResponseType =
  | "LOCATION"
  | "KEYWORD"
  | "CONFIRMATION"
  | "ANSWER"
  | "REACTION"
  | "NONE";

export type PresenterEvent = {
  id: string;
  type: PresenterEventType;
  startMs: number;
  endMs: number;
  triggerText: string;
  expectedResponseType: ExpectedResponseType;
  /** Janela em que uma resposta ainda é plausível, a contar do fim do evento. */
  responseWindowMs: number;
  confidence: number;
  semanticMomentId: string | null;
  /** Palavra-chave pedida ("EU", "QUERO"), quando aplicável. */
  keyword?: string;
};

export type TemporalRelation =
  | "REACTION_TO_PRESENTER"
  | "ANSWER_TO_PRESENTER"
  | "CAUSE_OF_PRESENTER_SPEECH"
  | "SPONTANEOUS";

export type CommentCausality = {
  temporalRelation: TemporalRelation;
  triggerType: "SEMANTIC_MOMENT" | "PRESENTER_EVENT" | "NONE";
  triggerId: string | null;
  triggerStartMs: number | null;
  triggerEndMs: number | null;
  reactionLatencyMs: number | null;
  generationReason: string;
  confidence: number;
  /** Oportunidade a que este comentário pertence, quando nasceu de uma. */
  slotId?: string | null;
  /** Tópico do gatilho. */
  topicId?: string | null;
  /** 0 a 1: quanto o assunto ainda estava vivo no instante da mensagem. */
  topicRelevanceScore?: number;
  topicStillActive?: boolean;
  /** 0 (mesmo assunto) a 1 (assunto completamente diferente). */
  semanticDistance?: number;
};


/** Resultado normalizado devolvido por qualquer motor de transcrição. */
/**
 * Bloco de áudio transcrito.
 *
 * Usado pelos motores sem tempos por palavra: o tempo é o do bloco enviado
 * para transcrição, não o momento exato de cada palavra.
 */
export type TranscriptBlock = {
  text: string;
  startMs: number;
  endMs: number;
};

export type NormalizedTranscription = {
  provider: string;
  providerModel: string;
  precision: TimestampPrecision;
  durationMs: number;
  rawText: string;
  /** Preenchido apenas com precisão por palavra. */
  words: NormalizedWord[];
  /** Preenchido apenas com precisão por bloco. */
  blocks: TranscriptBlock[];
};

export const PRECISION_LABEL: Record<TimestampPrecision, string> = {
  word: "Precisão por palavra",
  block: "Precisão por bloco de áudio",
  estimated: "Tempo estimado (legado)",
};

/** Só estes níveis permitem gerar o Chat Inteligente. */
export function allowsIntelligentGeneration(precision: TimestampPrecision) {
  return precision === "word" || precision === "block";
}

/** Margem mínima de segurança por nível de precisão, em milissegundos. */
export function precisionSafetyMarginMs(precision: TimestampPrecision) {
  if (precision === "word") return 0;
  if (precision === "block") return 4000;
  return 15000;
}
