/** As palavras do produto para o que o motor sabe de cada bloco e mensagem. */
import type { BlockType, Dependency, InteractionType } from "./types";

export const BLOCK_LABEL: Record<BlockType, string> = {
  CONTENT: "Conteúdo",
  QUESTION_TO_AUDIENCE: "Pergunta ao público",
  COMMENT_REQUEST: "Pede comentários",
  FEEDBACK_REQUEST: "Pede confirmação",
  POLL: "Sondagem",
  CHAT_READING: "Lê o chat",
  CHAT_RESPONSE: "Responde ao chat",
  SOCIAL_PROOF: "Prova social",
  EMOTIONAL_MOMENT: "Momento emocional",
  CTA: "Chamada à acção",
  OFFER: "Oferta",
  STORY: "História",
  TRANSITION: "Transição",
  TECHNICAL: "Parte técnica",
  SILENCE: "Silêncio",
  OTHER: "Outro",
};

export const DEPENDENCY_LABEL: Record<Dependency, string> = {
  BEFORE: "Antes de ser lido",
  AFTER: "Depois da fala",
  INDEPENDENT: "Livre",
};

export const INTERACTION_LABEL: Record<InteractionType, string> = {
  YES_NO: "sim ou não",
  NUMBER: "um número",
  EMOJI: "um emoji",
  LOCATION: "de onde vê",
  KEYWORD: "uma palavra",
  NAME: "o nome",
  SHORT_ANSWER: "resposta curta",
  LONG_ANSWER: "resposta longa",
  REACTION: "reacção",
  NONE: "sem resposta",
};

/** Cor de cada tipo de bloco na barra de tempo (classe Tailwind). */
export const BLOCK_TONE: Record<BlockType, string> = {
  CONTENT: "bg-gray-300",
  QUESTION_TO_AUDIENCE: "bg-sky-400",
  COMMENT_REQUEST: "bg-sky-500",
  FEEDBACK_REQUEST: "bg-sky-300",
  POLL: "bg-indigo-400",
  CHAT_READING: "bg-amber-400",
  CHAT_RESPONSE: "bg-amber-300",
  SOCIAL_PROOF: "bg-emerald-400",
  EMOTIONAL_MOMENT: "bg-rose-400",
  CTA: "bg-orange-500",
  OFFER: "bg-orange-400",
  STORY: "bg-violet-300",
  TRANSITION: "bg-gray-200",
  TECHNICAL: "bg-slate-300",
  SILENCE: "bg-white",
  OTHER: "bg-gray-200",
};

/** Cor de cada tipo de bloco em hexadecimal, para a barra de tempo em SVG. */
export const BLOCK_COLOR: Record<BlockType, string> = {
  CONTENT: "#d4d4d8",
  QUESTION_TO_AUDIENCE: "#38bdf8",
  COMMENT_REQUEST: "#0ea5e9",
  FEEDBACK_REQUEST: "#7dd3fc",
  POLL: "#818cf8",
  CHAT_READING: "#fbbf24",
  CHAT_RESPONSE: "#fcd34d",
  SOCIAL_PROOF: "#34d399",
  EMOTIONAL_MOMENT: "#fb7185",
  CTA: "#f97316",
  OFFER: "#fb923c",
  STORY: "#c4b5fd",
  TRANSITION: "#e4e4e7",
  TECHNICAL: "#cbd5e1",
  SILENCE: "#ffffff",
  OTHER: "#e4e4e7",
};

export const DEPENDENCY_COLOR: Record<Dependency, string> = {
  BEFORE: "#d97706",
  AFTER: "#0284c7",
  INDEPENDENT: "#71717a",
};
