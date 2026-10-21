/**
 * Regras para o chat simulado não parecer falso, sem ecrã e sem IA: nome e apelido do país de
 * cada pessoa (Angola, Moçambique, Brasil, Portugal ou uma mistura), atraso de quem está a ouvir,
 * escrita de telemóvel, quem chega atrasado, quem responde a outra pessoa, respostas às perguntas
 * do apresentador, testemunhos de alunos de um curso concreto, emojis e menos mensagens quando
 * há menos gente. Correm depois do gerador e antes de os comentários serem gravados.
 */
import { CHAT_COUNTRIES, type ChatCountryCode } from "@/lib/chat-variants";

export type { ChatCountryCode } from "@/lib/chat-variants";
export type ChatTone = "natural" | "vendas" | "formal";
/** Quanto se escreve, em relação ao normal para o número de pessoas na sala; «escolher» usa `perMinute`. */
export type ChatVolume = "menos" | "normal" | "mais" | "escolher";
export type ChatTag = "manual" | "late" | "answer" | "aluno" | "reply";

export type ChatAlunos = {
  on: boolean;
  /** O curso ou produto de que são alunos (por omissão, o da oferta). */
  product: string;
  /** Quantas pessoas o dizem (1 a MAX_ALUNOS). */
  count: number;
  /** «oferta»: depois de a oferta abrir; «aula»: ao longo da aula. */
  when: "oferta" | "aula";
};

export type ChatRules = {
  tone: ChatTone;
  volume: ChatVolume;
  /** Comentários por minuto quando o volume é «escolher» (lançamentos grandes). */
  perMinute: number;
  /** Com emojis ou sem: escolhe quem apresenta, em qualquer tom. */
  emoji: boolean;
  /** As nacionalidades de quem escreve: mudam os nomes e a forma de escrever. */
  countries: ChatCountryCode[];
  /** O país do lançamento: de onde dizem que estão a ver. Sem ele, cada pessoa diz uma cidade do seu país. */
  launch: ChatCountryCode | null;
  alunos: ChatAlunos;
  answersOn: boolean;
  /** Quantas pessoas respondem a cada pergunta do apresentador (1 a MAX_ANSWERS). */
  answers: number;
  delay: boolean;
  mobile: boolean;
  late: boolean;
  talk: boolean;
  follow: boolean;
};

/** Até onde vão os números livres: alunos e respostas (lançamentos grandes). */
export const MAX_ALUNOS = 100;
export const MAX_ANSWERS = 30;

export const DEFAULT_CHAT_RULES: ChatRules = {
  tone: "natural",
  volume: "normal",
  perMinute: 12,
  emoji: true,
  // Não vem nenhum país escolhido: quem apresenta escolhe de onde são as pessoas do chat.
  countries: [],
  launch: null,
  alunos: { on: true, product: "", count: 3, when: "oferta" },
  answersOn: true,
  answers: 4,
  delay: true,
  mobile: true,
  late: true,
  talk: true,
  follow: true,
};

/** As regras gravadas; o que falta (ou vem das versões antigas) fica como de origem. */
export function parseChatRules(raw: unknown): ChatRules {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return DEFAULT_CHAT_RULES;
  const r = raw as Record<string, unknown>;
  const codes = CHAT_COUNTRIES.map((c) => c.code);
  const legacyCountry = r["country"];
  const countries = Array.isArray(r["countries"])
    ? codes.filter((c) => (r["countries"] as unknown[]).includes(c))
    : legacyCountry === "mix"
      ? (["ao", "br", "pt"] as ChatCountryCode[])
      : codes.filter((c) => c === legacyCountry);
  const legacyLevel = { baixa: "menos", media: "normal", alta: "mais" }[String(r["level"])] as ChatVolume | undefined;
  const volume = (["menos", "normal", "mais", "escolher"] as const).find((v) => v === r["volume"]) ?? legacyLevel ?? "normal";
  const perMinute = Math.min(60, Math.max(1, Math.round(Number(r["perMinute"]) || DEFAULT_CHAT_RULES.perMinute)));
  const a = r["alunos"];
  const alunos: ChatAlunos =
    typeof a === "number"
      ? { on: a > 0, product: "", count: Math.max(1, a), when: "oferta" }
      : typeof a === "object" && a !== null
        ? {
            on: Boolean((a as ChatAlunos).on),
            product: String((a as ChatAlunos).product ?? "").slice(0, 80),
            count: Math.min(MAX_ALUNOS, Math.max(1, Math.round(Number((a as ChatAlunos).count)) || 3)),
            when: (a as ChatAlunos).when === "aula" ? "aula" : "oferta",
          }
        : DEFAULT_CHAT_RULES.alunos;
  const bool = (key: keyof ChatRules) => (typeof r[key] === "boolean" ? (r[key] as boolean) : (DEFAULT_CHAT_RULES[key] as boolean));
  const tone = (["natural", "vendas", "formal"] as const).find((t) => t === r["tone"]) ?? "natural";
  // As antigas gravavam 2, 4 ou 6 («2 a 3», «3 a 5», «5 a 8»): lêem-se como esse número de pessoas.
  const answers = Math.min(MAX_ANSWERS, Math.max(1, Math.round(Number(r["answers"])) || 4));
  return {
    tone,
    volume,
    perMinute,
    emoji: bool("emoji"),
    countries,
    launch: codes.find((c) => c === r["launch"]) ?? null,
    alunos,
    answersOn: bool("answersOn"),
    answers,
    delay: bool("delay"),
    mobile: bool("mobile"),
    late: bool("late"),
    talk: bool("talk"),
    follow: bool("follow"),
  };
}

/**
 * Quantos comentários por minuto e quantas pessoas diferentes escrevem, para o número de pessoas
 * na sala: com 50 pessoas, cerca de 4 por minuto; com 600, 12; com 5000, 30. «Menos» e «mais»
 * tiram ou juntam metade; «escolher» usa o número escrito (até 60, para lançamentos grandes).
 */
export function chatPace(audience: number, volume: ChatVolume, chosen = DEFAULT_CHAT_RULES.perMinute) {
  const v = Math.max(5, audience);
  const base = Math.min(30, Math.max(2, 0.55 * Math.pow(v, 0.48)));
  const perMinute =
    volume === "escolher" ? Math.min(60, Math.max(1, Math.round(chosen))) : Math.round(Math.min(40, base * { menos: 0.6, normal: 1, mais: 1.5 }[volume]));
  const people = Math.min(2000, Math.max(12, Math.round(v * 0.12)));
  return { perMinute: Math.max(1, perMinute), people };
}

/** Um comentário antes de ser gravado; o resto dos campos do gerador passa intacto. */
/** `fixed`: o instante veio do motor (ligado à fala) e as regras não o mexem nem o reescrevem. */
export type ChatDraft = { at: number; author: string; message: string; tag?: ChatTag | undefined; fixed?: boolean | undefined };

const FIRST: Record<ChatCountryCode, readonly string[]> = {
  ao: ["Edson", "Kátia", "Nelson", "Yola", "Mauro", "Délcio", "Hélder", "Celma", "Nádia", "Adilson", "Wilson", "Graça", "Osvaldo", "Lurdes", "Kiesse", "Neusa", "Ivo", "Elsa", "Cláudio", "Sandra", "Domingos", "Filomena", "Euclides", "Marisa", "Anacleto", "Josina", "Valdemar", "Nzinga", "Zola", "Teresa"],
  mz: ["Célia", "Hélio", "Dércio", "Anabela", "Amélia", "Edmundo", "Graciano", "Hermínio", "Nércia", "Osvaldo", "Telma", "Valter", "Zaida", "Jacinto", "Elsa", "Arsénio", "Benvinda", "Custódio", "Felizarda", "Isménia", "Lourenço", "Nilza", "Rosário", "Shelton"],
  br: ["Ana Clara", "João Pedro", "Larissa", "Thiago", "Camila", "Gabriel", "Juliana", "Lucas", "Fernanda", "Rafael", "Bruna", "Matheus", "Letícia", "Felipe", "Patrícia", "Diego", "Aline", "Rodrigo", "Vanessa", "Gustavo", "Jéssica", "Leandro", "Priscila", "Caio"],
  pt: ["Inês", "Tiago", "Beatriz", "Rui", "Sofia", "João", "Mariana", "Pedro", "Carolina", "Miguel", "Rita", "Nuno", "Catarina", "Ricardo", "Joana", "Duarte", "Marta", "Tomás", "Leonor", "Gonçalo", "Filipa", "André", "Teresa", "Bruno"],
};
const LAST: Record<ChatCountryCode, readonly string[]> = {
  ao: ["Mateus", "Domingos", "Fernandes", "António", "Manuel", "Sebastião", "Kiala", "Lukamba", "Ngola", "Cassoma", "Tchissola", "Bento", "Neto", "Cristóvão", "Mbala", "Simão", "Quintas", "Chitula", "Sapalo", "Lussati", "Mbinda", "Pedro", "Paulo"],
  mz: ["Macuácua", "Sitoe", "Nhantumbo", "Cossa", "Langa", "Tembe", "Muianga", "Matsinhe", "Chissano", "Mondlane", "Mabunda", "Chambal", "Mussa", "Bila", "Massingue", "Uamusse", "Zandamela", "Cumbe", "Machava"],
  br: ["Souza", "Oliveira", "Santos", "Lima", "Pereira", "Costa", "Rodrigues", "Almeida", "Nascimento", "Ferreira", "Carvalho", "Gomes", "Ribeiro", "Martins", "Araújo", "Barbosa", "Rocha", "Cardoso", "Teixeira", "Moreira"],
  pt: ["Silva", "Santos", "Ferreira", "Pereira", "Oliveira", "Costa", "Rodrigues", "Martins", "Sousa", "Fernandes", "Gonçalves", "Gomes", "Lopes", "Marques", "Alves", "Almeida", "Ribeiro", "Pinto", "Carvalho", "Teixeira"],
};

/** Nome e apelido de cada país escolhido; vários países intercalam-se. */
export function namePool(countries: readonly ChatCountryCode[]): readonly string[] {
  const list = countries.length ? countries : (["ao"] as const);
  const per = list.map((c) =>
    FIRST[c].map((first, i) => `${first} ${LAST[c][(i * 7 + 3) % LAST[c].length]}`),
  );
  const longest = Math.max(...per.map((names) => names.length));
  const out: string[] = [];
  for (let i = 0; i < longest; i += 1) for (const names of per) if (names[i]) out.push(names[i]!);
  return out;
}

/**
 * Quem compra nas compras de demonstração: o primeiro nome, das nacionalidades do chat. Em lançamentos grandes os
 * nomes voltam: primeiro com a inicial de um apelido («Kátia M.»), depois com o apelido inteiro («Kátia Mateus»),
 * para não se ver o mesmo nome a comprar duas vezes (nem o mesmo nome de dois países).
 */
export function buyerNames(countries: readonly ChatCountryCode[], count: number): string[] {
  const list = countries.length ? countries : (["ao"] as const);
  const longest = Math.max(...list.map((c) => FIRST[c].length));
  const order: [ChatCountryCode, number][] = [];
  for (let i = 0; i < longest; i += 1) for (const c of list) if (FIRST[c][i]) order.push([c, i]);
  const out: string[] = [];
  const used = new Set<string>();
  for (let k = 0; out.length < count; k += 1) {
    const [c, i] = order[k % order.length]!;
    const round = Math.floor(k / order.length);
    // Iniciais diferentes em cada volta; acabadas, os apelidos: o mesmo nome nunca sai igual.
    const initials = [...new Set(LAST[c].map((last) => last[0]!))];
    const name =
      round === 0
        ? FIRST[c][i]!
        : round <= initials.length
          ? `${FIRST[c][i]} ${initials[(i + round - 1) % initials.length]}.`
          : `${FIRST[c][i]} ${LAST[c][(i + round - 1 - initials.length) % LAST[c].length]}`;
    // ponytail: acima de nomes × (1 + iniciais + apelidos), mais de 690 por país, os nomes voltam.
    if (used.has(name) && round <= initials.length + LAST[c].length) continue;
    used.add(name);
    out.push(name);
  }
  return out;
}

/** De onde diz que está a ver: a forma de dizer é da nacionalidade; a cidade, do país do lançamento. */
export function placeLine(nationality: ChatCountryCode, launch: ChatCountryCode | null) {
  const place = CHAT_COUNTRIES.find((c) => c.code === (launch ?? nationality))!.places[0]!;
  return `${nationality === "br" ? "Assistindo" : "A ver"} ${place}`;
}

/** Quem chega atrasado: cumprimenta, diz de onde está a ver e pergunta pela gravação. */
const LATE: Record<ChatCountryCode, readonly [string, string]> = {
  ao: ["Boa noite, cheguei agora", "Entrei agora, o início fica gravado?"],
  mz: ["Boa noite, cheguei agora", "Entrei agora, vai ficar gravado?"],
  br: ["Boa noite, cheguei agora", "Entrei agora, vai ter replay?"],
  pt: ["Boa noite, cheguei agora", "Entrei agora, vai haver gravação?"],
};
const lateLine = (nationality: ChatCountryCode, launch: ChatCountryCode | null, i: number) =>
  i === 1 ? `Já começou? ${placeLine(nationality, launch)}` : LATE[nationality][i === 0 ? 0 : 1];
const TALK = ["também acho", "verdade", "isso mesmo", "pensei o mesmo", "concordo"];
const ALUNO = [
  "Já fiz {p} e recomendo muito",
  "Faço parte de {p}, o acompanhamento faz a diferença",
  "Entrei em {p} na última turma e não me arrependo",
  "{p} mudou a forma como eu vendo",
  "Quem está em dúvida: {p} vale mesmo a pena",
  "Comprei {p} no ano passado, valeu cada cêntimo",
  "Sou de {p} desde o início, é mesmo isto",
  "{p} foi o melhor investimento que fiz este ano",
  "Estou em {p} e sinto a diferença todos os dias",
  "Fiz {p} e hoje faço tudo com mais calma",
];
/** Com muitos alunos, a mesma frase volta com outro começo: nenhuma se repete até MAX_ALUNOS. */
const ALUNO_OPENER = ["", "Posso dizer: ", "Sinceramente, ", "Gente, ", "Pessoal, ", "Confirmo: ", "Por experiência: ", "Sem exagero, ", "Falo por mim: ", "Verdade seja dita, "];
const alunoLine = (k: number, product: string) => {
  const line = ALUNO[k % ALUNO.length]!;
  const opener = ALUNO_OPENER[Math.floor(k / ALUNO.length) % ALUNO_OPENER.length]!;
  // Depois do começo, a frase segue em minúscula (o nome do curso fica como está).
  const body = opener && !line.startsWith("{p}") ? line.charAt(0).toLocaleLowerCase("pt") + line.slice(1) : line;
  return opener + body.replace("{p}", product);
};
const ANSWERS = ["Sim!", "Sim, claríssimo", "Certo", "Faz todo o sentido", "Sim, percebi", "Siiim", "Claro", "Sim, continua", "Com certeza", "Está claro"];
const ANSWER_TAIL = ["", " aqui também", " por aqui", " sem dúvida", " totalmente", " muito"];
const ANSWER_OPENER = ["", "Eu: ", "Ah, ", "Ok, ", "Opa, "];
/** 10 × 6 × 5 = 300 respostas diferentes no webinar todo (10 perguntas com MAX_ANSWERS cada). */
const ANSWER_DISTINCT = ANSWERS.length * ANSWER_TAIL.length * ANSWER_OPENER.length;
const answerLine = (i: number) => {
  const opener = ANSWER_OPENER[Math.floor(i / (ANSWERS.length * ANSWER_TAIL.length)) % ANSWER_OPENER.length]!;
  const line = ANSWERS[i % ANSWERS.length]! + ANSWER_TAIL[Math.floor(i / ANSWERS.length) % ANSWER_TAIL.length]!;
  // Depois do começo, a frase segue em minúscula, como nos alunos.
  return opener ? opener + line.charAt(0).toLocaleLowerCase("pt") + line.slice(1) : line;
};
/** Emojis que entram nas mensagens: só positivos. */
const HAPPY = ["🔥", "👏", "🙌", "😍", "💯", "✨", "👍", "🙏", "❤️", "😮", "🚀", "💪"];

const EMOJI = /\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*/gu;

export function stripEmoji(text: string) {
  return text.replace(EMOJI, "").replace(/\s{2,}/g, " ").trim();
}

/** Escrita de telemóvel: «vc», «tb», «pq», «msm», sem ponto final e com minúscula no início. */
export function mobileText(text: string) {
  // \b não conhece letras acentuadas: as palavras delimitam-se por letras Unicode.
  const word = (w: string) => new RegExp(`(?<!\\p{L})${w}(?!\\p{L})`, "giu");
  const swaps: [RegExp, string][] = [
    [word("você"), "vc"],
    [word("também"), "tb"],
    [word("porque"), "pq"],
    [word("mesmo"), "msm"],
  ];
  let out = swaps.reduce((s, [re, to]) => s.replace(re, to), text).replace(/[.!]$/u, "");
  out = out.charAt(0).toLocaleLowerCase("pt") + out.slice(1);
  return out;
}

/** Frases em que o apresentador pergunta algo à audiência. */
export function hostQuestions(sentences: readonly { at: number; text: string }[]) {
  const asks = /(?<!\p{L})(gente|certo|pessoal|vocês|alguém|concordam|faz sentido|ficou claro)(?!\p{L})/iu;
  return sentences.filter((s) => s.text.trim().endsWith("?") && asks.test(s.text));
}

/** Os exemplos que o ecrã mostra para cada regra. */
export function lateExample(countries: readonly ChatCountryCode[], launch: ChatCountryCode | null = null) {
  return lateLine(countries[0] ?? launch ?? "ao", launch, 1);
}
export function alunoExample(product: string) {
  return ALUNO[0]!.replace("{p}", product.trim() || "a mentoria");
}

const first = (name: string) => name.split(" ")[0] ?? name;
/** Um nome com nome e apelido, como os que o gerador escreve. */
const fullName = (name: string) => name.trim().split(/\s+/).length >= 2;

export function applyChatRealism<T extends ChatDraft>(
  drafts: readonly T[],
  rules: ChatRules,
  ctx: {
    durationSeconds: number;
    pitchSeconds: number | null;
    questions?: readonly number[] | undefined;
    /** Audiência simulada entre 0 (mínimo) e 1 (máximo); null quando a sala não a mostra. */
    audienceAt?: ((seconds: number) => number | null) | undefined;
    /** O produto da oferta, para os alunos dizerem de quê. */
    product?: string | undefined;
  },
): (T | ChatDraft)[] {
  const d = ctx.durationSeconds > 0 ? ctx.durationSeconds : Number.POSITIVE_INFINITY;
  // Os emojis e a escrita de telemóvel escolhem-se à parte do tom (também no formal).
  const withEmoji = rules.emoji;
  const countries = rules.countries.length ? rules.countries : (["ao"] as ChatCountryCode[]);
  const cap = (t: number) => Math.max(0, Math.min(d, Math.round(t)));

  // 1. Emojis, escrita de telemóvel e atraso de quem está a ouvir.
  let out: (T | ChatDraft)[] = drafts.map((c, i) => {
    if (c.tag === "manual") return c;
    let message = withEmoji ? c.message : stripEmoji(c.message);
    // Mais emojis: uma em cada três mensagens sem nenhum ganha um.
    if (withEmoji && i % 3 === 1 && stripEmoji(message) === message) message = `${message} ${HAPPY[i % HAPPY.length]}`;
    if (rules.mobile && i % 4 === 2 && !c.fixed) message = mobileText(message);
    const at = c.fixed ? cap(c.at) : cap(c.at + (rules.delay ? 3 + ((i * 7) % 13) : 0));
    return { ...c, message: message || c.message, at };
  });

  // Mensagens do motor do chat (ligadas à fala): o nome é o que o apresentador diz, o instante é o certo.
  const engineDriven = drafts.some((c) => c.fixed);

  // 2. Quem chega atrasado, nos primeiros minutos (um de cada país escolhido, até três). Com o motor
  //    do chat, as chegadas já lá estão (elenco): não se acrescentam as genéricas.
  if (rules.late && !engineDriven) {
    [40, 78, 121].forEach((at, i) => {
      const country = countries[i % countries.length]!;
      if (at < d) {
        const emo = i === 0 && withEmoji ? " 🙋" : "";
        out.push({ at, author: "", message: lateLine(country, rules.launch, i) + emo, tag: "late" });
      }
    });
  }

  // 3. Respostas às perguntas do apresentador.
  if (rules.answersOn) {
    const questions = ctx.questions ?? [];
    // Com mais de 10 perguntas, cada uma fica com a sua parte das 300 respostas: nenhuma fica sem resposta.
    const n = Math.min(MAX_ANSWERS, Math.max(1, rules.answers), Math.max(1, Math.floor(ANSWER_DISTINCT / Math.max(1, questions.length))));
    questions.forEach((tq, q) => {
      for (let j = 0; j < n; j += 1) {
        const emo = withEmoji && j === 1 ? " 🙌" : "";
        out.push({
          at: cap(tq + 3 + 2 * j + ((q + j) % 3)),
          author: "",
          message: answerLine(n * q + j) + emo,
          tag: "answer",
        });
      }
    });
  }

  // 4. Alunos de um curso concreto: depois de a oferta abrir, ou ao longo da aula.
  if (rules.alunos.on && rules.alunos.count > 0 && Number.isFinite(d)) {
    const product = rules.alunos.product.trim() || ctx.product?.trim() || "a mentoria";
    const pitch = ctx.pitchSeconds ?? d * 0.8;
    const [from, to] = rules.alunos.when === "oferta" ? [pitch + 25, Math.min(d - 5, pitch + 900)] : [d * 0.2, d * 0.95];
    const n = Math.min(MAX_ALUNOS, rules.alunos.count);
    if (to > from) {
      for (let k = 0; k < n; k += 1) {
        const at = cap(from + ((k + 0.5) * (to - from)) / n);
        const emo = withEmoji && k % 2 === 0 ? " 🙌" : "";
        out.push({ at, author: "", message: alunoLine(k, product) + emo, tag: "aluno" });
      }
    }
  }
  out.sort((a, b) => a.at - b.at);

  // 5. Menos gente, mais silêncio: com a audiência em baixo, caem algumas mensagens.
  if (rules.follow && ctx.audienceAt) {
    out = out.filter((c, i) => {
      const norm = ctx.audienceAt!(c.at);
      if (c.tag || c.fixed || norm == null) return true;
      if (norm < 0.15) return i % 2 !== 0;
      return norm > 0.4 || i % 3 !== 0;
    });
  }

  // 6. Nome e apelido do país: os que o gerador escreveu ficam; os outros vêm da lista, sem o
  // mesmo nome antes de dois minutos.
  const pool = namePool(countries);
  const seen = new Map<string, number>();
  let k = 0;
  out = out.map((c) => {
    if (c.tag === "manual" && c.author) return c;
    // Do motor do chat: «Letícia» é a aluna que o apresentador vai nomear; fica como está, sem apelido.
    if (c.fixed && c.author) {
      seen.set(c.author, c.at);
      return c;
    }
    if (!c.tag && fullName(c.author)) {
      seen.set(c.author, c.at);
      return c;
    }
    let name = pool[k % pool.length]!;
    let tries = 0;
    while ((seen.get(name) ?? -Infinity) > c.at - 120 && tries < pool.length) {
      k += 1;
      tries += 1;
      name = pool[k % pool.length]!;
    }
    k += 1;
    seen.set(name, c.at);
    return { ...c, author: name };
  });

  // 7. Conversam entre si.
  if (rules.talk) {
    out = out.map((c, i) => {
      const prev = out[i - 1];
      if (i % 9 !== 6 || !prev || c.tag || c.fixed || prev.tag || c.at - prev.at >= 40 || prev.author === c.author) return c;
      const emo = withEmoji && i % 2 ? " 👏" : "";
      return { ...c, message: `@${first(prev.author)} ${TALK[i % TALK.length]}${emo}`, tag: "reply" as const };
    });
  }

  // 8. Nenhuma mensagem se repete.
  const used = new Set<string>();
  return out.filter((c) => {
    const key = stripEmoji(c.message).toLocaleLowerCase("pt").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!key || c.tag === "manual") return true;
    if (used.has(key)) return false;
    used.add(key);
    return true;
  });
}

/**
 * Uma folha com minuto, nome e mensagem (CSV ou colada de uma folha de cálculo). O minuto pode
 * ser «1:05», «01:05», «1:01:05» ou segundos. Linhas sem minuto ou sem mensagem ficam de fora.
 */
export function parseCommentSheet(text: string): ChatDraft[] {
  const rows = text.split(/\r?\n/).filter((line) => line.trim());
  const out: ChatDraft[] = [];
  for (const line of rows) {
    const cells = splitRow(line, line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",");
    const [time = "", author = "", ...rest] = cells.map((c) => c.trim());
    const at = parseClockText(time);
    const message = rest.join(", ").trim();
    if (at === null || !message) continue;
    out.push({ at, author: author.slice(0, 60), message: message.slice(0, 500), tag: "manual" });
  }
  return out.sort((a, b) => a.at - b.at);
}

function splitRow(line: string, sep: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else quoted = !quoted;
    } else if (ch === sep && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

function parseClockText(value: string): number | null {
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v);
  const parts = v.split(":");
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,2}$/.test(p))) return null;
  return parts.map(Number).reduce((total, n) => total * 60 + n, 0);
}

/** O porquê de cada comentário, na lista «Como ficou». */
export function chatTagLabel(tag: string | null | undefined, message?: string) {
  switch (tag) {
    case "manual":
      return "Escrito à mão";
    case "late":
      return "Chegou atrasado";
    case "answer":
      return "Responde à pergunta";
    case "aluno":
      return "Aluno do curso";
    case "reply": {
      const to = message?.match(/^@(\S+)/)?.[1];
      return to ? `Responde a ${to}` : "Responde a alguém";
    }
    default:
      return null;
  }
}
