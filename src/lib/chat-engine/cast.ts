/**
 * Método Nova, parte 1: o elenco.
 *
 * Um chat real tem pessoas concretas: cada uma chega a uma hora, algumas saem a meio, umas falam muito e
 * a maioria quase nada, e as alunas que o apresentador nomeia estão lá desde o início. O elenco é fixo
 * para o webinar inteiro (determinístico pela semente), por isso a mesma pessoa é sempre a mesma em todos
 * os trechos, e ninguém escreve antes de chegar nem depois de sair.
 */
import { namePool, type ChatCountryCode } from "@/lib/chat-realism";

import { rng } from "./timing";
import type { Profile } from "./profiles";
import type { SemanticBlock } from "./types";

export type CastRole = "publico" | "aluna";

export type CastMember = Profile & {
  role: CastRole;
  /** Segundo (ms) em que entra na sala. */
  arrivalMs: number;
  /** Segundo (ms) em que sai, ou null se fica até ao fim. */
  leaveMs: number | null;
  /** Uma linha sobre a pessoa (cidade, ocupação, porque está aqui), para a IA escrever com coerência. */
  situation: string;
};

export type CastOptions = {
  participants: number;
  countries: readonly ChatCountryCode[];
  durationMs: number;
  seed: number;
  hostName?: string | null | undefined;
};

function firstName(name: string) {
  return name.trim().split(/\s+/)[0]?.toLocaleLowerCase("pt") ?? "";
}

/** Os nomes que o apresentador diz ao longo do webinar (menos o dele), pela ordem em que os diz. */
export function namedPeople(blocks: readonly SemanticBlock[], hostName?: string | null): string[] {
  const host = firstName(hostName ?? "");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const block of [...blocks].sort((a, b) => a.startMs - b.startMs)) {
    if (!block.readsChat) continue;
    for (const item of block.referenced) {
      if (item.kind !== "name" || !item.name) continue;
      const key = firstName(item.name);
      if (!key || key === host || seen.has(key)) continue;
      seen.add(key);
      out.push(item.name.trim());
    }
  }
  return out;
}

/**
 * O elenco: cerca de 1,3 vezes os participantes pedidos (há quem saia e quem chegue), nunca menos de 6.
 * Chegadas: 60% nos primeiros 2 minutos, 25% até aos 10, o resto até 60% do vídeo. Saídas: 20% saem
 * depois de 40% do vídeo. Actividade em escada: poucos falam muito, a maioria pouco.
 */
export function buildCast(options: CastOptions, named: readonly string[] = []): CastMember[] {
  const random = rng(options.seed);
  const countries = options.countries.length ? options.countries : (["pt"] as const);
  const pool = namePool(countries);
  const size = Math.max(6, Math.min(400, Math.round(options.participants * 1.3)));
  const duration = Math.max(60_000, options.durationMs);
  const out: CastMember[] = [];
  const used = new Set<string>();

  const traits = (index: number) => {
    const r1 = random();
    const r2 = random();
    const r3 = random();
    // Escada de actividade: os primeiros nomes falam muito, depois cai depressa.
    const rank = index / Math.max(1, size - 1);
    const activity = Math.max(0.08, Math.min(1, 0.95 - rank * 0.75 + (random() - 0.5) * 0.2));
    return {
      emoji: r1 < 0.55,
      mobile: r2 < 0.5,
      length: (r3 < 0.55 ? "curto" : r3 < 0.9 ? "medio" : "longo") as Profile["length"],
      typos: random() < 0.3,
      activity,
    };
  };

  // As pessoas que o apresentador nomeia: alunas, desde o início, nunca saem, falam de forma moderada.
  named.forEach((name, index) => {
    const key = firstName(name);
    if (!key || used.has(key)) return;
    used.add(key);
    const t = traits(Math.min(size - 1, 2 + index));
    out.push({
      id: `a${index + 1}`,
      name,
      country: countries[index % countries.length]!,
      role: "aluna",
      arrivalMs: 0,
      leaveMs: null,
      situation: "",
      ...t,
      activity: Math.max(0.35, Math.min(0.7, t.activity)),
    });
  });

  let poolIndex = 0;
  for (let i = 0; i < size; i += 1) {
    let name = pool[poolIndex % pool.length]!;
    poolIndex += 1;
    // Um nome já usado (ou igual ao de uma aluna) leva uma inicial para o distinguir.
    if (used.has(firstName(name))) {
      let tries = 0;
      while (used.has(firstName(name)) && tries < pool.length) {
        name = pool[poolIndex % pool.length]!;
        poolIndex += 1;
        tries += 1;
      }
      if (used.has(firstName(name))) name = `${name} ${String.fromCharCode(65 + (i % 26))}.`;
    }
    used.add(firstName(name));
    const r = random();
    const arrivalMs =
      r < 0.6
        ? Math.round(random() * 120_000)
        : r < 0.85
          ? Math.round(120_000 + random() * 480_000)
          : Math.round(600_000 + random() * Math.max(0, duration * 0.6 - 600_000));
    const leaves = random() < 0.2;
    const leaveMs = leaves
      ? Math.round(duration * 0.4 + random() * duration * 0.55)
      : null;
    out.push({
      id: `c${i + 1}`,
      name,
      country: countries[i % countries.length]!,
      role: "publico",
      arrivalMs: Math.min(arrivalMs, Math.max(0, duration - 60_000)),
      leaveMs: leaveMs != null && leaveMs > arrivalMs + 120_000 ? leaveMs : null,
      situation: "",
      ...traits(i),
    });
  }
  return out;
}

/** Quem está na sala num instante. */
export function present(cast: readonly CastMember[], atMs: number): CastMember[] {
  return cast.filter((m) => m.arrivalMs <= atMs && (m.leaveMs == null || m.leaveMs > atMs));
}

export function memberByName(cast: readonly CastMember[], name: string): CastMember | null {
  const key = firstName(name);
  if (!key) return null;
  return (
    cast.find((m) => m.name.toLocaleLowerCase("pt") === name.trim().toLocaleLowerCase("pt")) ??
    cast.find((m) => firstName(m.name) === key) ??
    null
  );
}

/** A descrição de uma pessoa para a IA: nome, país, estilo e situação. */
export function describeMember(m: CastMember): string {
  const traits = [
    m.role === "aluna" ? "aluna do apresentador, já conhecida dele" : "",
    m.length === "curto" ? "frases curtas" : m.length === "longo" ? "escreve parágrafos" : "frases médias",
    m.emoji ? "usa emojis" : "sem emojis",
    m.mobile ? "escreve de telemóvel, abreviado, sem maiúsculas" : "escreve com cuidado",
    m.typos ? "às vezes com gralhas" : "",
  ]
    .filter(Boolean)
    .join(", ");
  const country = { ao: "Angola", mz: "Moçambique", br: "Brasil", pt: "Portugal" }[m.country];
  return `- ${m.name} (${m.id}, ${country}): ${traits}${m.situation ? `. ${m.situation}` : ""}`;
}

/** O elenco tal como viaja entre o planeamento e cada trecho (JSON simples). */
export function serializeCast(cast: readonly CastMember[]): CastMember[] {
  return cast.map((m) => ({ ...m }));
}
