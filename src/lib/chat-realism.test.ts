import { describe, expect, it } from "vitest";
import {
  applyChatRealism,
  buyerNames,
  chatPace,
  chatTagLabel,
  DEFAULT_CHAT_RULES,
  hostQuestions,
  lateExample,
  MAX_ALUNOS,
  MAX_ANSWERS,
  mobileText,
  namePool,
  parseChatRules,
  parseCommentSheet,
  stripEmoji,
  type ChatDraft,
} from "@/lib/chat-realism";

const drafts: ChatDraft[] = Array.from({ length: 40 }, (_, i) => ({
  at: 10 + i * 7,
  author: "Gerado",
  message: `Comentário número ${i} sobre o upsell 🔥`,
}));
const ctx = { durationSeconds: 329, pitchSeconds: 311, questions: [69, 168] };

describe("regras do chat simulado", () => {
  it("nomes do país e nunca o mesmo nome antes de dois minutos", () => {
    const out = applyChatRealism(drafts, DEFAULT_CHAT_RULES, ctx);
    const pool = new Set(namePool(["ao"]));
    const last = new Map<string, number>();
    for (const c of out) {
      expect(pool.has(c.author)).toBe(true);
      const prev = last.get(c.author);
      if (prev !== undefined) expect(c.at - prev).toBeGreaterThanOrEqual(120);
      last.set(c.author, c.at);
    }
  });

  it("escrevem uns segundos depois e nunca depois do fim do vídeo", () => {
    const out = applyChatRealism(drafts, { ...DEFAULT_CHAT_RULES, late: false, answersOn: false }, ctx);
    for (const c of out) expect(c.at).toBeLessThanOrEqual(329);
    const firstOut = out.find((c) => c.message.includes("número 0"));
    expect(firstOut!.at - 10).toBeGreaterThanOrEqual(3);
  });

  it("há quem chegue atrasado e quem responda às perguntas do apresentador", () => {
    const out = applyChatRealism(drafts, DEFAULT_CHAT_RULES, ctx);
    expect(out.filter((c) => c.tag === "late")).toHaveLength(3);
    const answers = out.filter((c) => c.tag === "answer");
    expect(answers).toHaveLength(8);
    expect(answers.every((c) => c.at > 69)).toBe(true);
  });

  it("os alunos dizem de que curso são e aparecem depois de a oferta abrir", () => {
    const long: ChatDraft[] = Array.from({ length: 60 }, (_, i) => ({ at: 10 + i * 19, author: "Gerado", message: `Mensagem ${i}` }));
    const rules = { ...DEFAULT_CHAT_RULES, alunos: { on: true, product: "Mentoria Primo", count: 3, when: "oferta" as const } };
    const out = applyChatRealism(long, rules, { durationSeconds: 1200, pitchSeconds: 600 });
    const alunos = out.filter((c) => c.tag === "aluno");
    expect(alunos).toHaveLength(3);
    expect(alunos.every((c) => c.at > 600 && c.message.includes("Mentoria Primo"))).toBe(true);
    const spread = applyChatRealism(long, { ...rules, alunos: { ...rules.alunos, when: "aula" as const } }, {
      durationSeconds: 1200,
      pitchSeconds: 600,
    }).filter((c) => c.tag === "aluno");
    expect(spread.some((c) => c.at < 600)).toBe(true);
  });

  it("os nomes do gerador (nome e apelido) ficam; os outros vêm da lista do país", () => {
    const out = applyChatRealism(
      [{ at: 30, author: "Célia Macuácua", message: "Boa noite, maningue bom" } as ChatDraft],
      { ...DEFAULT_CHAT_RULES, countries: ["mz"], late: true },
      { durationSeconds: 300, pitchSeconds: null },
    );
    expect(out.find((c) => c.message.startsWith("Boa noite, maningue"))!.author).toBe("Célia Macuácua");
    const late = out.filter((c) => c.tag === "late");
    expect(late.every((c) => namePool(["mz"]).includes(c.author))).toBe(true);
    expect(late.some((c) => c.message.includes("Maputo"))).toBe(true);
  });

  it("o país do lançamento dá a cidade; a nacionalidade, a forma de dizer", () => {
    const rules = { ...DEFAULT_CHAT_RULES, countries: ["br" as const], launch: "ao" as const };
    const late = applyChatRealism([], rules, { durationSeconds: 300, pitchSeconds: null }).filter((c) => c.tag === "late");
    expect(late.some((c) => c.message.includes("Assistindo de Luanda"))).toBe(true);
    expect(late.every((c) => namePool(["br"]).includes(c.author))).toBe(true);
    expect(lateExample(["pt"], "mz")).toBe("Já começou? A ver de Maputo");
    expect(lateExample(["pt"])).toBe("Já começou? A ver de Lisboa");
  });

  it("alunos e respostas em número livre, sem nenhuma mensagem repetida", () => {
    const long: ChatDraft[] = Array.from({ length: 10 }, (_, i) => ({ at: 10 + i * 60, author: "Gerado", message: `Mensagem ${i}` }));
    const rules = {
      ...DEFAULT_CHAT_RULES,
      late: false,
      talk: false,
      alunos: { on: true, product: "Mentoria Primo", count: MAX_ALUNOS, when: "aula" as const },
      answers: 12,
    };
    const out = applyChatRealism(long, rules, { durationSeconds: 3600, pitchSeconds: 2400, questions: [300, 900] });
    expect(out.filter((c) => c.tag === "aluno")).toHaveLength(MAX_ALUNOS);
    expect(out.filter((c) => c.tag === "answer")).toHaveLength(24);
    const keys = out.map((c) => stripEmoji(c.message).toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("cada pergunta recebe as respostas prometidas, mesmo com muitas perguntas", () => {
    const perQuestion = (questions: number[], answers: number) => {
      const out = applyChatRealism([], { ...DEFAULT_CHAT_RULES, late: false, alunos: { ...DEFAULT_CHAT_RULES.alunos, on: false }, answers }, {
        durationSeconds: 3600,
        pitchSeconds: null,
        questions,
      }).filter((c) => c.tag === "answer");
      return questions.map((tq, q) => out.filter((c) => c.at >= tq && (q + 1 === questions.length || c.at < questions[q + 1]!)).length);
    };
    const eight = Array.from({ length: 8 }, (_, q) => 200 + q * 300);
    expect(perQuestion(eight, 10)).toEqual(Array(8).fill(10));
    expect(perQuestion(eight, MAX_ANSWERS)).toEqual(Array(8).fill(MAX_ANSWERS));
    // Com mais de 10 perguntas no máximo, repartem-se por igual: nenhuma fica sem resposta.
    const many = perQuestion(Array.from({ length: 12 }, (_, q) => 100 + q * 280), MAX_ANSWERS);
    expect(new Set(many).size).toBe(1);
    expect(many[0]).toBeGreaterThan(0);
  });

  it("sem emojis, as mensagens saem sem emojis; no tom formal, os emojis são escolha de quem apresenta", () => {
    const none = applyChatRealism(drafts, { ...DEFAULT_CHAT_RULES, emoji: false }, ctx);
    expect(none.every((c) => stripEmoji(c.message) === c.message)).toBe(true);
    const formal = applyChatRealism(drafts, { ...DEFAULT_CHAT_RULES, tone: "formal" as const, emoji: true }, ctx);
    expect(formal.some((c) => stripEmoji(c.message) !== c.message)).toBe(true);
  });

  it("nenhuma mensagem se repete", () => {
    const twins = [...drafts, ...drafts.map((c) => ({ ...c, at: c.at + 1 }))];
    const out = applyChatRealism(twins, DEFAULT_CHAT_RULES, ctx);
    const keys = out.map((c) => stripEmoji(c.message).toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("as mensagens do motor do chat ficam com o nome que o apresentador diz, mesmo só o primeiro nome", () => {
    const engine: ChatDraft[] = [
      { at: 32, author: "Letícia", message: "sou eu aqui", fixed: true },
      { at: 35, author: "Joana", message: "aqui 😊", fixed: true },
      ...drafts.slice(0, 5),
    ];
    const out = applyChatRealism(engine, DEFAULT_CHAT_RULES, ctx);
    expect(out.find((c) => c.message.startsWith("sou eu aqui"))?.author).toBe("Letícia");
    expect(out.find((c) => c.message.startsWith("aqui"))?.author).toBe("Joana");
    // Com o motor, as chegadas genéricas («Já começou? A ver de…») não entram: o elenco já chega sozinho.
    expect(out.some((c) => c.tag === "late")).toBe(false);
  });

  it("o que foi escrito à mão fica como está", () => {
    const manual: ChatDraft = { at: 50, author: "", message: "Escrito por mim!", tag: "manual" };
    const out = applyChatRealism([manual], DEFAULT_CHAT_RULES, ctx);
    expect(out.find((c) => c.tag === "manual")).toMatchObject({ at: 50, message: "Escrito por mim!" });
  });

  it("com pouca gente a ver, há menos mensagens", () => {
    const quiet = applyChatRealism(drafts, { ...DEFAULT_CHAT_RULES, late: false, answersOn: false, talk: false }, {
      ...ctx,
      audienceAt: () => 0.1,
    });
    expect(quiet.length).toBeLessThan(drafts.length);
  });
});

describe("países, volume e regras antigas", () => {
  it("nome e apelido de cada país, intercalados numa mistura", () => {
    const pool = namePool(["ao", "br"]);
    expect(pool.every((n) => n.split(" ").length >= 2)).toBe(true);
    expect(pool[0]).toMatch(/^Edson /);
    expect(pool[1]).toMatch(/^Ana Clara /);
  });

  it("o volume do chat segue o número de pessoas", () => {
    expect(chatPace(50, "normal").perMinute).toBeGreaterThanOrEqual(3);
    expect(chatPace(600, "normal").perMinute).toBe(12);
    expect(chatPace(5000, "normal").perMinute).toBe(30);
    expect(chatPace(600, "mais").perMinute).toBeGreaterThan(chatPace(600, "menos").perMinute);
    expect(chatPace(600, "normal").people).toBe(72);
    // Lançamentos grandes: o número por minuto escolhe-se à mão, até 60.
    expect(chatPace(600, "escolher", 45).perMinute).toBe(45);
    expect(chatPace(600, "escolher", 400).perMinute).toBe(60);
  });

  it("um webinar novo não tem nenhum país escolhido", () => {
    expect(parseChatRules(null).countries).toEqual([]);
    expect(parseChatRules(null).launch).toBeNull();
    expect(parseChatRules({ launch: "mz" }).launch).toBe("mz");
    expect(parseChatRules({ launch: "xx" }).launch).toBeNull();
    expect(parseChatRules({ countries: [] }).countries).toEqual([]);
    expect(parseChatRules({ countries: ["br", "ao"] }).countries).toEqual(["ao", "br"]);
  });

  it("as regras antigas (um país, intensidade, alunos em número) ainda se lêem", () => {
    const rules = parseChatRules({ country: "mix", level: "alta", alunos: 2, tone: "vendas" });
    expect(rules.countries).toEqual(["ao", "br", "pt"]);
    expect(rules.volume).toBe("mais");
    expect(rules.alunos).toMatchObject({ on: true, count: 2, when: "oferta" });
    expect(rules.tone).toBe("vendas");
    expect(parseChatRules(null)).toEqual(DEFAULT_CHAT_RULES);
    // Números livres, dentro dos limites.
    expect(parseChatRules({ alunos: { on: true, count: 40 }, answers: 6 })).toMatchObject({ alunos: { count: 40 }, answers: 6 });
    expect(parseChatRules({ alunos: { on: true, count: 9999 }, answers: 0 })).toMatchObject({ alunos: { count: MAX_ALUNOS }, answers: 4 });
  });

  it("quem compra: primeiro nome das nacionalidades, e com inicial quando os nomes voltam", () => {
    const names = buyerNames(["mz"], 60);
    expect(names).toHaveLength(60);
    expect(names[0]).toBe("Célia");
    expect(new Set(names).size).toBe(60);
    expect(names.at(-1)).toMatch(/^\p{L}+ \p{Lu}\.$/u);
  });

  it("até 500 compras (o máximo das Vendas), nenhum nome compra duas vezes", () => {
    for (const c of ["ao", "mz", "br", "pt"] as const) expect(new Set(buyerNames([c], 500)).size).toBe(500);
    // Nomes que existem em dois países (Osvaldo, Elsa, Teresa) também não se repetem.
    expect(new Set(buyerNames(["ao", "mz", "pt"], 500)).size).toBe(500);
    expect(buyerNames(["pt"], 500).at(-1)).toMatch(/^\p{L}+ \p{L}{2,}$/u);
  });
});

describe("textos", () => {
  it("escrita de telemóvel", () => {
    expect(mobileText("Você também percebeu.")).toBe("vc tb percebeu");
  });

  it("perguntas do apresentador à audiência", () => {
    const qs = hostQuestions([
      { at: 69, text: "Quando você comprou uma nova oferta, certo?" },
      { at: 100, text: "O que é o upsell?" },
      { at: 168, text: "Ficou claro isso aqui, gente?" },
    ]);
    expect(qs.map((q) => q.at)).toEqual([69, 168]);
  });

  it("folha com minuto, nome e mensagem", () => {
    const sheet = 'minuto,nome,mensagem\n1:05,Ana,"Boa noite, cheguei"\n00:40;Rui;Olá\n\nxx,Sem,minuto\n90\tInês\tVerdade';
    expect(parseCommentSheet(sheet)).toEqual([
      { at: 40, author: "Rui", message: "Olá", tag: "manual" },
      { at: 65, author: "Ana", message: "Boa noite, cheguei", tag: "manual" },
      { at: 90, author: "Inês", message: "Verdade", tag: "manual" },
    ]);
  });

  it("o porquê de cada comentário", () => {
    expect(chatTagLabel("reply", "@Edson verdade")).toBe("Responde a Edson");
    expect(chatTagLabel("late")).toBe("Chegou atrasado");
    expect(chatTagLabel(null)).toBeNull();
  });
});
