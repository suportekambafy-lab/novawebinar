import { describe, expect, it } from "vitest";

import { missingMandatory } from "./ai-comments.functions";
import type { InteractionSlot } from "./chat-engine/types";

function slot(partial: Partial<InteractionSlot> & { id: string }): InteractionSlot {
  return {
    blockId: "b1",
    blockType: "CHAT_READING",
    dependency: "BEFORE",
    interaction: "NONE",
    blockStartMs: 65_000,
    blockEndMs: 68_000,
    windowStartMs: 57_000,
    windowEndMs: 63_000,
    minComments: 2,
    maxComments: 2,
    strong: false,
    referenced: [],
    keyword: null,
    speech: "",
    context: "",
    confidence: 0.9,
    needsReview: false,
    offerContext: "desconhecido",
    reason: "",
    ...partial,
  };
}

describe("missingMandatory", () => {
  it("devolve quem o apresentador vai nomear e a IA não escreveu", () => {
    const read = slot({
      id: "b8_lido",
      referenced: [
        { kind: "name", name: "Letícia", place: null, text: "5 mil" },
        { kind: "name", name: "Joana", place: null, text: "2 mil euros" },
      ],
    });
    const missing = missingMandatory([read], [{ slot: "b8_lido", author: "Letícia Almeida" }], 0, 120);
    expect(missing).toHaveLength(1);
    expect(missing[0]!.items.map((i) => i.name)).toEqual(["Joana"]);
  });

  it("conta as perguntas sem nome pelo que já lá está, e ignora slots fora do trecho", () => {
    const question = slot({
      id: "b97_pergunta",
      blockType: "CHAT_RESPONSE",
      referenced: [{ kind: "question", name: null, place: null, text: "Como é que eu faço pra ganhar dinheiro com isso?" }],
    });
    expect(missingMandatory([question], [], 0, 120)[0]!.items[0]!.kind).toBe("question");
    expect(missingMandatory([question], [{ slot: "b97_pergunta", author: "Nuno Silva" }], 0, 120)).toEqual([]);
    expect(missingMandatory([question], [], 600, 900)).toEqual([]);
  });

  it("nada falta quando todos os nomes já escreveram", () => {
    const read = slot({
      id: "b8_lido",
      referenced: [{ kind: "name", name: "Letícia", place: null, text: "" }],
    });
    expect(missingMandatory([read], [{ slot: "b8_lido", author: "letícia" }], 0, 120)).toEqual([]);
  });
});
