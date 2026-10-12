/**
 * `\b` em JavaScript só conhece letras ASCII: "já", "aí" ou "você" não têm
 * fronteira de palavra no fim. Aqui `\b` passa a valer para qualquer letra.
 */
const BOUNDARY = String.raw`(?:(?<=[\p{L}\p{N}])(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])(?=[\p{L}\p{N}]))`;

/** Expressão regular com `\b` consciente de acentos. Flags sempre com `u`. */
export function ure(source: string, flags = ""): RegExp {
  const unique = flags.includes("u") ? flags : `${flags}u`;
  return new RegExp(source.replace(/\\b/g, BOUNDARY), unique);
}
