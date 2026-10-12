import { describe, expect, it } from "vitest";

import { buildSemanticBlocks, classifyText, extractReferences, type SentenceLike } from "./blocks";
import { planRegeneration } from "./merge";
import { planInteractions } from "./plan";
import { kindFor, placeSlot } from "./timing";
import type { EngineComment, InteractionSlot } from "./types";
import { validateEngine } from "./validate";

let n = 0;
function s(startS: number, endS: number, text: string): SentenceLike {
  n += 1;
  return { id: `s${n}`, text, startMs: startS * 1000, endMs: endS * 1000 };
}

const DEFAULTS = { participants: 40, perMinute: 10, offerStartMs: null as number | null };
const plan = (
  blocks: ReturnType<typeof buildSemanticBlocks>,
  extra: Partial<Parameters<typeof planInteractions>[1]> = {},
) => planInteractions(blocks, { fromMs: 0, toMs: 3_600_000, ...DEFAULTS, ...extra });

function comment(
  partial: Partial<EngineComment> & { atMs: number; message: string },
): EngineComment {
  n += 1;
  return {
    id: `c${n}`,
    author: "Edson Mateus",
    slotId: null,
    blockId: null,
    dependency: "INDEPENDENT",
    confidence: 0.5,
    ...partial,
  };
}

describe("blocos de fala", () => {
  it("pergunta directa ao público espera resposta; pergunta retórica não", () => {
    expect(classifyText("Quem aqui já tentou vender online?").type).toBe("POLL");
    expect(classifyText("O que é que vocês acham disto?").expectsResponse).toBe(true);
    const rhetorical = classifyText("Será que isto funciona para toda a gente?");
    expect(rhetorical.rhetorical).toBe(true);
    expect(rhetorical.expectsResponse).toBe(false);
  });

  it("pergunta seguida da própria resposta do apresentador fica retórica", () => {
    const blocks = buildSemanticBlocks([
      s(10, 13, "Vocês sabem qual é o maior erro de quem começa?"),
      s(13.4, 20, "É querer vender antes de ter audiência. Eu vi isso centenas de vezes."),
    ]);
    const first = blocks[0]!;
    expect(first.rhetorical).toBe(true);
    expect(first.expectsResponse).toBe(false);
    expect(plan(blocks).some((slot) => slot.dependency === "AFTER")).toBe(false);
  });

  it("pedido de confirmação é sim/não; pedido de emoji é emoji; pedido de cidade é localização", () => {
    const yes = classifyText("Faz sentido? Manda um sim no chat.");
    expect(yes.type).toBe("FEEDBACK_REQUEST");
    expect(yes.interaction).toBe("YES_NO");
    expect(classifyText("Manda um foguinho aí se tás a gostar.").interaction).toBe("EMOJI");
    const where = classifyText("Escrevam aí no chat de onde é que estão a ver.");
    expect(where.type).toBe("COMMENT_REQUEST");
    expect(where.interaction).toBe("LOCATION");
    expect(classifyText("Escreve EU aqui no chat se queres saber como.").keyword).toBe("EU");
  });

  it("leitura do chat extrai o nome, a cidade e a pergunta", () => {
    const refs = extractReferences(
      "A Mariana pergunta se funciona para quem está a começar e o João de Benguela diz que já fez a primeira venda.",
    );
    const names = refs.filter((r) => r.kind === "name");
    expect(names.map((r) => r.name)).toEqual(["Mariana", "João"]);
    expect(names[0]!.text).toMatch(/^se funciona para quem está a começar/);
    expect(names[1]!.place).toBe("Benguela");
    expect(refs.some((r) => r.kind === "city")).toBe(false);
    expect(classifyText("Vejo aqui a Mariana de Luanda, boa!").type).toBe("CHAT_READING");
  });

  it("«deixe aqui nos comentários» logo a seguir à pergunta é a mesma oportunidade", () => {
    const blocks = buildSemanticBlocks([
      s(10, 13, "Quem está aqui para fazer acontecer de verdade?"),
      s(13.5, 15, "Deixe aqui nos comentários."),
      s(16, 20, "Vocês conseguem me ouvir, ok?"),
    ]);
    expect(blocks.map((b) => b.type)).toEqual(["POLL", "FEEDBACK_REQUEST"]);
    expect(blocks[0]!.endMs).toBe(15_000);
    const slots = plan(blocks);
    expect(slots.filter((slot) => slot.dependency === "AFTER")).toHaveLength(2);
    expect(slots[0]!.windowStartMs).toBe(16_500);
    expect(
      classifyText("Você tem que montar uma loja que parece uma marca, ok?").expectsResponse,
    ).toBe(false);
  });

  it("silêncio entre blocos fica marcado e a oferta e o CTA são reconhecidos", () => {
    const blocks = buildSemanticBlocks([
      s(0, 8, "Hoje vou mostrar como montar o teu negócio digital do zero."),
      s(20, 26, "Clica no botão aqui em baixo e garante a tua vaga."),
      s(28, 34, "O investimento é de 97 euros com garantia de 7 dias."),
    ]);
    expect(blocks.map((b) => b.type)).toEqual(["CONTENT", "SILENCE", "CTA", "OFFER"]);
    expect(blocks[1]!.endMs - blocks[1]!.startMs).toBe(12_000);
  });
});

describe("plano e tempos", () => {
  it("comentário lido existe 2 a 8 segundos ANTES de o apresentador o ler, pela ordem de leitura", () => {
    const blocks = buildSemanticBlocks([
      s(10, 14, "Escrevam aí no chat de onde é que estão a ver."),
      s(30, 36, "Vejo aqui a Mariana de Luanda, o Pedro do Porto, boa malta!"),
    ]);
    const slots = plan(blocks);
    const before = slots.find((slot) => slot.dependency === "BEFORE")!;
    expect(before.blockType).toBe("CHAT_READING");
    expect(before.referenced.map((r) => r.name)).toEqual(["Mariana", "Pedro"]);
    expect(before.referenced.map((r) => r.place)).toEqual(["Luanda", "Porto"]);
    expect(before.windowStartMs).toBe(22_000);
    expect(before.windowEndMs).toBe(28_000);
    const times = placeSlot(before, 2, 3);
    expect(times).toHaveLength(2);
    expect(times[0]!).toBeLessThan(times[1]!);
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(22_000);
      expect(t).toBeLessThanOrEqual(28_000);
    }
  });

  it("respostas DEPOIS da pergunta: a primeira entre 1,5 e 4 s, as outras até 15 s, com atraso natural", () => {
    const blocks = buildSemanticBlocks([
      s(10, 14, "O que é que vocês acham que é o mais difícil quando se começa?"),
    ]);
    const slot = plan(blocks).find((x) => x.dependency === "AFTER")!;
    expect(slot.interaction).toBe("SHORT_ANSWER");
    const times = placeSlot(slot, 6, 5);
    expect(times[0]!).toBeGreaterThanOrEqual(15_500);
    expect(times[0]!).toBeLessThanOrEqual(18_000);
    for (let i = 1; i < times.length; i += 1) {
      expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(900);
      expect(times[i]!).toBeLessThanOrEqual(14_000 + 15_000);
    }
    expect(placeSlot(slot, 6, 5)).toEqual(times);
  });

  it("interacção forte deixa a cascata ir até quase 30 s", () => {
    const blocks = buildSemanticBlocks([
      s(10, 14, "Quem aqui já tentou vender online levanta a mão, escreve EU no chat!"),
    ]);
    const slot = plan(blocks).find((x) => x.dependency === "AFTER")!;
    expect(slot.strong).toBe(true);
    const times = placeSlot(slot, 12, 9);
    expect(Math.max(...times)).toBeGreaterThan(14_000 + 15_000);
    expect(Math.max(...times)).toBeLessThanOrEqual(14_000 + 28_000);
  });

  it("pergunta e leitura imediata: a mensagem lida só existe depois da pergunta", () => {
    const blocks = buildSemanticBlocks([
      s(10, 14, "Escrevam aí de onde estão a ver."),
      s(16, 20, "Vejo aqui a Kátia de Luanda, boa!"),
    ]);
    const before = plan(blocks).find((slot) => slot.dependency === "BEFORE")!;
    expect(before.windowStartMs).toBeGreaterThanOrEqual(15_500);
    expect(before.windowEndMs).toBeGreaterThanOrEqual(before.windowStartMs);
    expect(before.windowEndMs).toBeLessThan(16_000);
    // Sem janela real, a mensagem fica colada antes da leitura e nunca depois.
    const times = placeSlot(before, 1, 1);
    expect(times[0]!).toBeLessThan(16_000);
  });

  it("CTA e oferta só criam oportunidades depois de a oferta ser apresentada", () => {
    const early = buildSemanticBlocks([
      s(100, 106, "Clica no botão aqui em baixo e garante a tua vaga."),
    ]);
    expect(plan(early, { offerStartMs: 500_000 })).toHaveLength(0);
    const late = buildSemanticBlocks([
      s(600, 606, "Clica no botão aqui em baixo e garante a tua vaga."),
    ]);
    const slot = plan(late, { offerStartMs: 500_000 })[0]!;
    expect(slot.dependency).toBe("AFTER");
    expect(slot.blockType).toBe("CTA");
    expect(kindFor(slot.dependency, false)).toBe("reage");
  });

  it("bloco com pouca confiança não gera pretextos", () => {
    const blocks = buildSemanticBlocks([s(30, 36, "Vejo aqui a Mariana de Luanda, boa!")]);
    blocks[0]!.confidence = 0.4;
    expect(plan(blocks).some((slot) => slot.dependency === "BEFORE")).toBe(false);
  });
});

describe("validação", () => {
  const blocks = buildSemanticBlocks([
    s(10, 14, "Faz sentido? Manda um sim no chat."),
    s(30, 36, "Vejo aqui a Mariana de Luanda, a dizer que sim, boa!"),
    s(60, 70, "Agora o investimento: são 97 euros com garantia de 7 dias."),
  ]);
  const slots = plan(blocks, { offerStartMs: 60_000 });
  const after = slots.find((x) => x.dependency === "AFTER" && x.blockType === "FEEDBACK_REQUEST")!;
  const before = slots.find((x) => x.dependency === "BEFORE")!;
  const base = { blocks, slots, offerStartMs: 60_000, durationMs: 600_000 };

  it("nunca responde antes da pergunta", () => {
    const result = validateEngine(
      [
        comment({
          atMs: 12_000,
          message: "sim!!",
          slotId: after.id,
          blockId: after.blockId,
          dependency: "AFTER",
        }),
      ],
      base,
    );
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]!.atMs).toBeGreaterThanOrEqual(15_500);
    expect(result.issues[0]!.rule).toBe("resposta-antes-da-pergunta");
  });

  it("nunca aparece depois de ter sido lida", () => {
    const result = validateEngine(
      [
        comment({
          atMs: 33_000,
          author: "Mariana Silva",
          message: "sim, faz todo o sentido",
          slotId: before.id,
          blockId: before.blockId,
          dependency: "BEFORE",
        }),
      ],
      base,
    );
    expect(result.kept[0]!.atMs).toBeLessThanOrEqual(28_000);
    expect(result.issues[0]!.rule).toBe("mensagem-depois-de-lida");
  });

  it("o nome lido pelo apresentador passa a ser o autor", () => {
    const result = validateEngine(
      [
        comment({
          atMs: 25_000,
          author: "Carlos Neto",
          message: "sim, faz todo o sentido",
          slotId: before.id,
          blockId: before.blockId,
          dependency: "BEFORE",
        }),
      ],
      base,
    );
    expect(result.kept[0]!.author).toMatch(/^Mariana/);
    expect(result.issues[0]!.rule).toBe("nome-lido");
  });

  it("pedido de sim/não: a resposta tem de ser sim ou não", () => {
    const result = validateEngine(
      [
        comment({
          atMs: 16_000,
          message: "siiim 🙌",
          slotId: after.id,
          blockId: after.blockId,
          dependency: "AFTER",
        }),
        comment({
          atMs: 18_000,
          message: "Luanda aqui",
          slotId: after.id,
          blockId: after.blockId,
          dependency: "AFTER",
        }),
      ],
      base,
    );
    expect(result.kept.map((c) => c.message)).toEqual(["siiim 🙌"]);
    expect(result.byRule["formato-errado"]).toBe(1);
  });

  it("ninguém fala da oferta antes de a oferta ser apresentada", () => {
    const result = validateEngine(
      [
        comment({ atMs: 40_000, message: "quanto custa o curso?" }),
        comment({ atMs: 65_000, message: "97 euros é justo" }),
      ],
      base,
    );
    expect(result.kept.map((c) => c.atMs)).toEqual([65_000]);
    expect(result.byRule["oferta-antes-da-oferta"]).toBe(1);
  });

  it("mensagens repetidas, «@Nome» sem mensagem anterior e duas no mesmo instante", () => {
    const result = validateEngine(
      [
        comment({
          atMs: 16_000,
          author: "Ana Lopes",
          message: "sim",
          slotId: after.id,
          blockId: after.blockId,
          dependency: "AFTER",
        }),
        comment({
          atMs: 16_100,
          author: "Rui Costa",
          message: "sim",
          slotId: after.id,
          blockId: after.blockId,
          dependency: "AFTER",
        }),
        comment({
          atMs: 16_300,
          author: "Rui Costa",
          message: "@Zé também acho que sim",
          slotId: after.id,
          blockId: after.blockId,
          dependency: "AFTER",
        }),
        comment({ atMs: 17_000, author: "Yola Dias", message: "@Ana sim sim" }),
      ],
      base,
    );
    expect(result.byRule["duplicado"]).toBe(1);
    expect(result.kept.find((c) => c.author === "Rui Costa")!.message).toBe("também acho que sim");
    expect(result.kept.find((c) => c.author === "Yola Dias")!.replyTo).toBe("Ana");
    for (let i = 1; i < result.kept.length; i += 1)
      expect(result.kept[i]!.atMs - result.kept[i - 1]!.atMs).toBeGreaterThanOrEqual(700);
  });

  it("ninguém conhece o futuro", () => {
    const result = validateEngine(
      [comment({ atMs: 20_000, message: "investimento com garantia, boa" })],
      { ...base, offerStartMs: null },
    );
    expect(result.kept).toHaveLength(0);
    expect(result.byRule["conhecimento-futuro"]).toBe(1);
  });

  it("um pretexto fora de uma leitura do chat passa a livre", () => {
    const result = validateEngine(
      [
        comment({
          atMs: 12_000,
          message: "sim",
          slotId: after.id,
          blockId: after.blockId,
          dependency: "BEFORE",
        }),
      ],
      base,
    );
    expect(result.kept[0]!.dependency).toBe("INDEPENDENT");
    expect(result.byRule["pretexto-sem-leitura"]).toBe(1);
  });
});

describe("regeneração", () => {
  it("mantém o que foi escrito ou editado à mão e não duplica a sua oportunidade", () => {
    const existing = [
      {
        id: "a",
        at: 20,
        author: "Kátia Mateus",
        message: "Luanda 🙌",
        type: "manual",
        slotId: null,
        edited: false,
      },
      {
        id: "b",
        at: 16,
        author: "Rui Costa",
        message: "sim!",
        type: "pergunta",
        slotId: "b1_resp",
        edited: true,
      },
      {
        id: "c",
        at: 40,
        author: "Ana Lopes",
        message: "top",
        type: "geral",
        slotId: null,
        edited: false,
      },
    ];
    const generated = [
      { at: 17, author: "Yola Dias", message: "faz sentido sim", slotId: "b1_resp" },
      { at: 21, author: "Kátia Mateus", message: "de Luanda", slotId: null },
      { at: 50, author: "Ivo Pedro", message: "boa explicação", slotId: "b3_livre" },
    ];
    const result = planRegeneration(existing, generated);
    expect(result.keep.map((c) => c.id)).toEqual(["a", "b"]);
    expect(result.deleteIds).toEqual(["c"]);
    expect(result.inserts.map((c) => c.author)).toEqual(["Ivo Pedro"]);
    expect(result.skipped).toBe(2);
  });
});
