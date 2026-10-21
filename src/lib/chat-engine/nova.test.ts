import { describe, expect, it } from "vitest";

import { buildSemanticBlocks, cueEndFor, type SentenceLike } from "./blocks";
import { buildCast, memberByName, namedPeople, present } from "./cast";
import { offerStartFromBlocks, planInteractions } from "./plan";
import { buildScript, freeTopic, presenterState } from "./script";
import { placeSlot } from "./timing";

let n = 0;
function s(startS: number, endS: number, text: string): SentenceLike {
  n += 1;
  return { id: `s${n}`, text, startMs: startS * 1000, endMs: endS * 1000 };
}

const blocks = buildSemanticBlocks([
  s(2, 8, "Boa noite, pessoal! Estou acompanhando vocês aqui pelo chat, então quero saber se vocês estão conseguindo me ouvir."),
  s(13, 16, "Se vocês conseguem me ouvir, digita um aqui no chat para eu saber."),
  s(36, 39, "Estou vendo aqui que tem algumas alunas do meu curso."),
  s(40, 52, "Letícia, a Joana, a Lúcia, sejam muito bem-vindas. Quero que vocês coloquem aqui pra gente quanto vocês já faturaram desde que entraram no curso."),
  s(65, 68, "Aqui, ó. Letícia, 5 mil. Joana, 2 mil euros."),
  s(72, 80, "Alessandra, que entrou faz uma semana, já faturou 400 euros. Eu quero parabenizar as minhas alunas."),
  s(100, 125, "Quando eu comecei, há cinco anos, eu não tinha nada. Larguei o meu emprego de 10 anos e hoje o digital mudou a minha vida."),
  s(140, 146, "Deixa aqui nos comentários quanto vocês cobrariam por um vídeo editado."),
  s(300, 304, "Olha só! 5 mil euros?"),
  s(305, 307, "2 mil euros?"),
  s(400, 420, "Vamos falar do investimento. O curso completo fica por 97 euros, e você pode parcelar em três vezes."),
]);

const cast = buildCast(
  { participants: 25, countries: ["pt", "br"], durationMs: 600_000, seed: 7, hostName: "Carol Delfes" },
  namedPeople(blocks, "Carol Delfes"),
);

describe("elenco", () => {
  it("tem as alunas nomeadas desde o início, e o público chega e sai de forma determinística", () => {
    const alunas = cast.filter((m) => m.role === "aluna").map((m) => m.name);
    expect(alunas).toEqual(["Letícia", "Joana", "Lúcia", "Alessandra"]);
    for (const m of cast.filter((m) => m.role === "aluna")) expect(m.arrivalMs).toBe(0);
    expect(cast.filter((m) => m.role === "publico").length).toBeGreaterThanOrEqual(25);
    const again = buildCast(
      { participants: 25, countries: ["pt", "br"], durationMs: 600_000, seed: 7, hostName: "Carol Delfes" },
      namedPeople(blocks, "Carol Delfes"),
    );
    expect(again.map((m) => `${m.name}:${m.arrivalMs}`)).toEqual(cast.map((m) => `${m.name}:${m.arrivalMs}`));
    // Nos primeiros 10 s está menos gente do que aos 5 minutos.
    expect(present(cast, 10_000).length).toBeLessThan(present(cast, 300_000).length);
    // Nomes nunca repetidos (o primeiro nome identifica a pessoa).
    const firsts = cast.map((m) => m.name.split(" ")[0]!.toLocaleLowerCase("pt"));
    expect(new Set(firsts).size).toBe(firsts.length);
    expect(memberByName(cast, "letícia")?.role).toBe("aluna");
  });
});

describe("guião", () => {
  const slots = planInteractions(blocks, {
    fromMs: 0,
    toMs: 600_000,
    participants: 25,
    perMinute: 8,
    offerStartMs: null,
    hostName: "Carol Delfes",
  });
  const lines = buildScript(slots, cast, {
    fromMs: 0,
    toMs: 600_000,
    seed: 3,
    perMinute: 8,
    offerStartMs: offerStartFromBlocks(blocks),
    existing: [],
  });

  it("as alunas escrevem antes de serem nomeadas e respondem ao pedido dirigido a elas", () => {
    const presence = lines.filter((l) => l.intent === "presenca");
    expect(presence.map((l) => l.author).sort()).toEqual(["Joana", "Letícia", "Lúcia"]);
    for (const l of presence) expect(l.atMs).toBeLessThan(40_000);
    const answers = lines.filter((l) => l.slotId?.endsWith("_resp") && l.windowStartMs! > 50_000 && l.windowStartMs! < 60_000);
    expect(answers.map((l) => l.author)).toEqual(expect.arrayContaining(["Letícia", "Joana", "Lúcia"]));
    const read = lines.filter((l) => l.intent === "lida" && l.mustText && l.atMs < 100_000);
    expect(read.map((l) => [l.author, l.mustText])).toEqual(
      expect.arrayContaining([
        ["Letícia", "5 mil"],
        ["Joana", "2 mil euros"],
      ]),
    );
    for (const l of read) expect(l.atMs).toBeLessThan(65_000 - 2000);
  });

  it("ninguém escreve antes de chegar, nem responde a dois pedidos ao mesmo tempo, e as respostas têm cauda", () => {
    const byId = new Map(cast.map((m) => [m.id, m] as const));
    for (const l of lines) {
      const m = byId.get(l.memberId);
      if (!m) continue;
      expect(l.atMs).toBeGreaterThanOrEqual(m.arrivalMs);
      if (m.leaveMs != null) expect(l.atMs).toBeLessThan(m.leaveMs);
    }
    const answers = lines.filter((l) => l.intent === "resposta").sort((a, b) => a.atMs - b.atMs);
    const last = new Map<string, number>();
    for (const l of answers) {
      const prev = last.get(l.memberId);
      if (prev != null) expect(l.atMs - prev).toBeGreaterThanOrEqual(30_000);
      last.set(l.memberId, l.atMs);
    }
    // O pedido forte aos 140 s («quanto cobrariam») tem respostas para lá dos 28 s da janela curta.
    const priced = answers.filter((l) => l.slotId?.startsWith("b") && l.windowStartMs! >= 146_000 && l.windowStartMs! <= 150_000);
    expect(priced.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...priced.map((l) => l.atMs))).toBeGreaterThan(146_000 + 28_000);
    // Nunca duas no mesmo instante.
    const times = lines.map((l) => l.atMs).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i += 1) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(700);
  });

  it("a leitura «5 mil euros?» aos 300 s lê respostas do pedido dos 140 s, não mensagens coladas à leitura", () => {
    const read = slots.find((slot) => slot.id.endsWith("_lido") && slot.blockStartMs === 300_000)!;
    expect(read.windowStartMs).toBe(146_000 + 1500);
    expect(read.windowEndMs).toBeLessThanOrEqual(146_000 + 90_000);
    const line = lines.find((l) => l.slotId === read.id)!;
    expect(line.atMs).toBeLessThan(240_000);
  });

  it("a oferta é lida nos blocos quando o editor não a marcou, e as mensagens soltas rodam de intenção", () => {
    expect(offerStartFromBlocks(blocks)).toBe(400_000);
    expect(new Set([0, 1, 2, 3, 4, 5].map((t) => freeTopic("CONTENT", false, t))).size).toBeGreaterThanOrEqual(3);
    expect(freeTopic("CONTENT", true, 0)).toBe("intencao");
    const free = lines.filter((l) => l.intent === "solta");
    expect(free.length).toBeGreaterThan(0);
    for (const l of free) expect(l.maxWords).toBeLessThanOrEqual(22);
  });

  it("a sala abre vibrante: cumprimentos nos primeiros segundos, antes de a apresentadora falar", () => {
    const opening = lines.filter((l) => l.intent === "chegada" && l.atMs < 20_000);
    expect(opening.length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...opening.map((l) => l.atMs))).toBeLessThan(8000);
    for (const l of opening) expect(l.maxWords).toBeLessThanOrEqual(5);
    expect(presenterState(opening[0]!, null)).toMatch(/a sala está a abrir/);
  });

  it("as respostas contam do fim da frase que pergunta, não do fim do bloco", () => {
    const group = [
      s(500, 504, "Quantos clientes é preciso para viver disto?"),
      s(504.5, 520, "Eu vou dizer-vos já a seguir, porque isto muda tudo no que vem depois."),
    ];
    expect(cueEndFor(group)).toBe(504_000);
    const [block] = buildSemanticBlocks(group);
    expect(block!.cueEndMs).toBe(504_000);
    // Se a IA disser que ele ficou mesmo à espera, a janela de respostas abre 1,5 s depois dos 504 s.
    const asking = { ...block!, type: "QUESTION_TO_AUDIENCE" as const, expectsResponse: true, interaction: "NUMBER" as const, confidence: 0.9 };
    const slot = planInteractions([asking], { fromMs: 0, toMs: 600_000, participants: 25, perMinute: 8, offerStartMs: null })[0]!;
    expect(slot.cueEndMs).toBe(504_000);
    expect(slot.windowStartMs).toBe(505_500);
    const times = placeSlot(slot, 3, 2);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(505_500);
    expect(Math.min(...times)).toBeLessThan(520_000);
  });

  it("o guião de um trecho só tem linhas desse trecho e identifica cada uma", () => {
    const part = buildScript(slots, cast, {
      fromMs: 120_000,
      toMs: 240_000,
      seed: 3,
      perMinute: 8,
      offerStartMs: null,
      existing: [{ atMs: 110_000, author: cast[5]!.name }],
    });
    for (const l of part) {
      expect(l.atMs).toBeGreaterThanOrEqual(120_000);
      expect(l.atMs).toBeLessThanOrEqual(240_999);
    }
    expect(new Set(part.map((l) => l.id)).size).toBe(part.length);
  });
});
