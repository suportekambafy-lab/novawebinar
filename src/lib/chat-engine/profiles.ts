/**
 * Perfis persistentes de quem escreve no chat: nome e país, estilo (emojis,
 * escrita de telemóvel, tamanho das frases, gralhas) e actividade. O mesmo
 * perfil escreve sempre da mesma maneira ao longo do webinar.
 */
import { namePool, type ChatCountryCode } from "@/lib/chat-realism";

import { ure } from "./regex";
import { rng } from "./timing";

export type Profile = {
  id: string;
  name: string;
  country: ChatCountryCode;
  emoji: boolean;
  mobile: boolean;
  length: "curto" | "medio" | "longo";
  typos: boolean;
  /** 0 a 1: quanto escreve. */
  activity: number;
};

const COUNTRY_OF_LAST: Partial<Record<string, ChatCountryCode>> = {};

export function buildProfiles(
  count: number,
  countries: readonly ChatCountryCode[],
  seed = 7,
): Profile[] {
  const random = rng(seed);
  const list = countries.length ? countries : (["ao"] as const);
  const pool = namePool(list);
  const out: Profile[] = [];
  for (let i = 0; i < Math.max(1, count); i += 1) {
    const name = pool[i % pool.length]!;
    const country = list[i % list.length]!;
    COUNTRY_OF_LAST[name] = country;
    const r1 = random();
    const r2 = random();
    const r3 = random();
    out.push({
      id: `p${i + 1}`,
      name: i >= pool.length ? `${name} ${String.fromCharCode(65 + (i % 26))}.` : name,
      country,
      emoji: r1 < 0.55,
      mobile: r2 < 0.45,
      length: r3 < 0.5 ? "curto" : r3 < 0.85 ? "medio" : "longo",
      typos: random() < 0.25,
      activity: 0.2 + random() * 0.8,
    });
  }
  return out;
}

export function describeProfiles(profiles: readonly Profile[], max = 60): string {
  return [...profiles]
    .sort((a, b) => b.activity - a.activity)
    .slice(0, max)
    .map((p) => {
      const traits = [
        p.length === "curto"
          ? "frases curtas"
          : p.length === "longo"
            ? "escreve parágrafos"
            : "frases médias",
        p.emoji ? "usa emojis" : "sem emojis",
        p.mobile ? "escreve de telemóvel, abreviado" : "escreve com cuidado",
        p.typos ? "às vezes com gralhas" : "",
        p.activity > 0.7 ? "fala muito" : p.activity < 0.35 ? "fala pouco" : "",
      ]
        .filter(Boolean)
        .join(", ");
      return `- ${p.name} (${p.id}): ${traits}`;
    })
    .join("\n");
}

const ABBREV_BR: [RegExp, string][] = [
  [ure(String.raw`\bvocê\b`, "gi"), "vc"],
  [ure(String.raw`\btambém\b`, "gi"), "tb"],
  [ure(String.raw`\bporque\b`, "gi"), "pq"],
  [ure(String.raw`\bmuito\b`, "gi"), "mt"],
  [ure(String.raw`\bobrigad[oa]\b`, "gi"), "obg"],
  [ure(String.raw`\bestá\b`, "gi"), "tá"],
  [ure(String.raw`\bpara\b`, "gi"), "pra"],
];
const ABBREV_PT: [RegExp, string][] = [
  [ure(String.raw`\bestá\b`, "gi"), "tá"],
  [ure(String.raw`\bpara\b`, "gi"), "pra"],
  [ure(String.raw`\bobrigad[oa]\b`, "gi"), "obg"],
  [ure(String.raw`\btambém\b`, "gi"), "tb"],
];
const EMOJI_RE = /(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]|\u{FE0F})/gu;

/** A mensagem escrita à maneira desta pessoa. */
export function styleMessage(profile: Profile, message: string, seed = 0): string {
  const random = rng(seed + profile.id.length * 31 + message.length);
  let text = message.trim();
  if (!profile.emoji)
    text = text
      .replace(EMOJI_RE, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  if (profile.mobile) {
    const table = profile.country === "br" ? ABBREV_BR : ABBREV_PT;
    for (const [re, to] of table) if (random() < 0.6) text = text.replace(re, to);
    if (random() < 0.7) text = text.charAt(0).toLocaleLowerCase("pt") + text.slice(1);
    text = text.replace(/\.$/u, "");
  }
  if (profile.typos && random() < 0.35) {
    // Uma gralha humana: um acento que cai.
    text = text.replace(/([áéíóú])/u, (m) => ({ á: "a", é: "e", í: "i", ó: "o", ú: "u" })[m] ?? m);
  }
  return text || message;
}

export function profileByName(profiles: readonly Profile[], name: string): Profile | null {
  const key = name.trim().toLocaleLowerCase("pt");
  return (
    profiles.find((p) => p.name.toLocaleLowerCase("pt") === key) ??
    profiles.find((p) => p.name.toLocaleLowerCase("pt").startsWith(key.split(" ")[0] ?? key)) ??
    null
  );
}
