/**
 * Da transcrição aos blocos de fala com sentido.
 *
 * 1. As frases juntam-se em blocos de 10 a 30 s, cortados nas pausas; uma
 *    frase que pede algo ao público (pergunta, pedido, leitura do chat) fica
 *    num bloco só dela, para a janela de resposta ser exacta.
 * 2. Cada bloco é classificado por regras (português de Portugal, Brasil,
 *    Angola e Moçambique) com uma confiança. A IA pode refinar depois
 *    (classify.server.ts), mas as regras valem sozinhas.
 * 3. Os silêncios entre blocos ficam marcados: ninguém reage ao nada.
 */
import { namePool } from "@/lib/chat-realism";

import { ure } from "./regex";
import type { BlockType, InteractionType, ReferencedItem, SemanticBlock } from "./types";

export type SentenceLike = { id: string; text: string; startMs: number; endMs: number };

export const BLOCK_MAX_MS = 30_000;
export const BLOCK_MAX_WORDS = 70;
export const BLOCK_PAUSE_MS = 1500;
export const SILENCE_MIN_MS = 4000;

const RE = {
  reading: ure(
    String.raw`(\bvejo aqui\b|\bj[áa] vi aqui\b|\bvi aqui\b|\bestou a ver (?:aqui )?(?:no chat|nos coment[áa]rios|que|muita gente|gente|o pessoal|a malta)\b|\b(?:t[ôo]|estou) vendo (?:aqui )?(?:no chat|nos coment[áa]rios|que|muita gente|gente|o pessoal|a galera)\b|\b(?:tem|temos|h[áa]) (?:aqui )?(?:muita |v[áa]rias? |alguma |bastante )?(?:gente|pessoas?|alun[oa]s?|pessoal|malta|galera) (?:d[eao] [a-záéíóúâêôãõç]|a dizer|a perguntar|a escrever|dizendo|perguntando|falando|escrevendo)\b|\btemos aqui alun[oa]s\b|\b(?:no chat|nos coment[áa]rios) (?:diz|disse|est[áa]|t[áa]|tem|escreveu|perguntou|pergunta|a dizer|a perguntar|dizendo|perguntando)\b|\balgu[ée]m (?:perguntou|escreveu|disse|mandou|falou|comentou)\b|\best[ãa]o a (?:perguntar|dizer|escrever)\b|\bt[áa] perguntando\b|\bt[áa]o? (?:falando|perguntando|dizendo)\b|\bo pessoal (?:t[áa]|est[áa])\b|\bj[áa] vi (?:aqui )?(?:nos coment[áa]rios|no chat)\b|\bvi (?:aqui )?(?:nos coment[áa]rios|no chat)\b)`,
    "i",
  ),
  response: ure(
    String.raw`(\bboa pergunta\b|\b[óo]tima pergunta\b|\bexcelente pergunta\b|\brespondendo (?:à|a|ao)\b|\b(?:para|pra) quem perguntou\b|\bquem perguntou\b|\ba resposta (?:é|e)\b|\bvou responder\b|\bsim,? (?:funciona|d[áa]|serve|pode|consegue)\b|\bn[ãa]o,? n[ãa]o (?:precisa|funciona|é preciso)\b)`,
    "i",
  ),
  request: ure(
    String.raw`(\b(?:escrev(?:e|a|am)|digit(?:a|e|em)|coment(?:a|e|em)|mand(?:a|e|em)|colo(?:ca|cam|que|quem)|bot(?:a|e|em)|deix(?:a|e|em|am)|respond(?:e|a|am)|p(?:õe|onham))\b[^.?!]{0,60}\b(?:no chat|nos coment[áa]rios|a[ií](?: no chat| nos coment[áa]rios| em ?baixo| embaixo)?|aqui (?:no chat|nos coment[áa]rios|em ?baixo|embaixo))\b|\b(?:escrev(?:e|a|am)|digit(?:a|e|em)|coment(?:a|e|em)|mand(?:a|e|em)|colo(?:ca|cam|que|quem)|deix(?:a|e|em|am))\s+(?:aqui|a[ií])\b(?! (?:em cima|por cima|dentro|ao lado|o (?:qr|link|bot[ãa]o)))|\bquero ver (?:no chat|nos coment[áa]rios|a[ií])\b|\bme (?:diz|diga|conta|fala|digam|contem|falem) (?:a[ií]|no chat|nos coment[áa]rios)\b|\bdiz(?:em|am)?[- ]me (?:a[ií]|no chat|nos coment[áa]rios)\b)`,
    "i",
  ),
  feedback: ure(
    String.raw`(\bfaz sentido\b|\bt[áa] (?:fazendo|a fazer) sentido\b|\best[áa] (?:a fazer|fazendo) sentido\b|\bconseguem (?:ver|ouvir|me ouvir)\b|\bd[áa] para (?:ver|ouvir)\b|\bt[áa] (?:claro|dando|chegando|ouvindo|me ouvindo)\b|\bficou claro\b|\best[ãa]o a (?:ouvir|ver|perceber|acompanhar)\b|\bt[ãa]o (?:ouvindo|vendo|acompanhando|entendendo)\b|\bme d[áa] um (?:sim|1|joinha|ok)\b|\bmand(?:a|em|am) um (?:sim|1|emoji|cora[çc][ãa]o|fogo|joinha|like)\b|\bescrev(?:e|am) (?:sim|1|ok)\b|\bd[êe]em? um (?:sim|like)\b|\bconcordam\b|\bcerto\?|\bbeleza\?|\bcombinado\?|\bt[áa] bom\?|\bpode ser\?)`,
    "i",
  ),
  poll: ure(
    String.raw`(\bquem (?:aqui|de voc[êe]s|a[ií]|est[áa] aqui|que est[áa] aqui|que t[áa] aqui|que me est[áa])\b|\blevant(?:a|em|am) a m[ãa]o\b|\bquantos (?:de voc[êe]s|aqui|j[áa]|a[ií])\b|\b(?:escreve|digita|manda|coloca)(?:m)? ?(?:1|2|um|dois) (?:se|para|pra|quem)\b|\b1 (?:se|para|pra) [^.?!]{0,40}\b2 (?:se|para|pra)\b)`,
    "i",
  ),
  question: ure(String.raw`\?\s*$`, ""),
  secondPerson: ure(
    String.raw`(\bvoc[êe]s?\b|\btu\b|\bte\b|\bvosso\b|\bvossa\b|\bteu\b|\btua\b|\ba[ií]\b|\bgente\b|\bpessoal\b|\bgalera\b|\bmalta\b|\bquem\b|\balgu[ée]m\b|\bme (?:diz|conta|fala|diga)\b|\bconcordam\b|\bconseguem\b|\bsabem\b|\bquerem\b|\bt[ãa]o\b)`,
    "i",
  ),
  rhetorical: ure(
    String.raw`(\bser[áa] que\b|\bo que (?:é que )?(?:isto|isso) (?:quer dizer|significa)\b|\bsabem? porqu[êe]\b|\ba pergunta (?:é|e)\b|\be sabe[ms]? o que\b|\badivinh(?:a|em)\b|\be a[ií]\?\s*$|\bo que (?:é que )?(?:acontece|aconteceu)\b|\bqual (?:é|e) o problema\b|\bqual (?:é|e) a diferen[çc]a\b|\bsabem? qual\b|\bo que (?:é que )?eu (?:fiz|descobri)\b)`,
    "i",
  ),
  socialProof: ure(
    String.raw`(\balun[oa]s?\b|\bresultados?\b|\bfaturou\b|\bfacturou\b|\bfatura\b|\bfactura\b|\bconseguiu\b|\bconseguiram\b|\bdepoimento\b|\bcaso d[oa]\b|\bganhou\b|\bganharam\b|\bvendeu\b|\bvenderam\b|\bfechou\b|\bfecharam\b|\bem \d+ dias\b|\bmil (?:euros|reais|kwanzas|d[óo]lares|meticais)\b|\b\d+ ?(?:k|mil)\b|\btestemunho\b|\bhist[óo]ria d[oa] \p{Lu})`,
    "i",
  ),
  emotional: ure(
    String.raw`(\bchorei\b|\bchorar\b|\bchorava\b|\bfam[íi]lia\b|\bperdi\b|\bperdemos\b|\bdif[íi]cil\b|\bsonho\b|\bmedo\b|\bvergonha\b|\bdesistir\b|\bdesisti\b|\bmorreu\b|\bfaleceu\b|\bdoen[çc]a\b|\bsem dinheiro\b|\bd[íi]vidas\b|\bdepress[ãa]o\b|\bansiedade\b|\bcansad[oa]\b|\bsofri\b|\bl[áa]grimas\b|\borgulho\b|\bemocionad[oa]\b|\bgratid[ãa]o\b|\bminha m[ãa]e\b|\bmeu pai\b|\bmeus filhos\b|\bminha filha\b|\bmeu filho\b)`,
    "i",
  ),
  cta: ure(
    String.raw`(\bclic(?:a|am|ar|ou|ando|ca|que|quem)\b[^.?!]{0,20}\b(?:no|em|aqui|bot[ãa]o|link)\b|\bcarreg(?:a|am|ar) no bot[ãa]o\b|\blink\b[^.?!]{0,20}\b(?:em ?baixo|abaixo|aqui|na descri[çc][ãa]o|a[ií])\b|\binscrev(?:e|am|a|er)[- ]?(?:te|se|vos|se j[áa])?\b|\bgarant(?:e|am|a|ir) (?:j[áa] )?(?:a tua|a sua|o teu|o seu|a vossa)\b|\bentr(?:a|em|ar) agora\b|\baproveit(?:a|em|ar)\b|\b[úu]ltimas vagas\b|\bvagas limitadas\b|\bbot[ãa]o (?:verde|amarelo|laranja|azul|a[ií]|abaixo|em ?baixo)\b|\bs[óo] (?:até|hoje)\b|\bapenas hoje\b|\btermina (?:hoje|em|daqui)\b|\bencerra (?:hoje|em|daqui)\b|\bquero entrar\b|\bfaz(?:em)? a (?:tua|sua) inscri[çc][ãa]o\b)`,
    "i",
  ),
  offer: ure(
    String.raw`(\boferta\b|\binvestimento\b|\bpre[çc]o\b|\bcusta\b|\bcustava\b|\bb[óo]nus\b|\bbonus\b|\bgarantia\b|\bparcelas?\b|\bpresta[çc][õo]es\b|\bdesconto\b|\bvalor (?:de|é|e|normal|total|real)\b|€|\bR\$|\bacesso vital[íi]cio\b|\bv[ãa]o receber\b|\best[áa] inclu[íi]do\b|\bprograma\b[^.?!]{0,30}\binclui\b|\bo que (?:é que )?(?:voc[êe]s? )?(?:vai|v[ãa]o) (?:receber|ter acesso|levar)\b|\bvagas?\b[^.?!]{0,20}\b(?:limitadas?|restantes?)\b|\binscri[çc][ãa]o\b)`,
    "i",
  ),
  story: ure(
    String.raw`(\bquando eu\b|\bh[áa] \d+ anos\b|\bem 20\d\d\b|\ba minha hist[óo]ria\b|\bminha hist[óo]ria\b|\bcomecei\b|\bcome[çc]ei\b|\blembro[- ]me\b|\bme lembro\b|\bum dia\b|\bnaquela altura\b|\bnaquela [ée]poca\b|\beu era\b|\beu tinha\b|\beu estava\b|\beu tava\b|\bna altura\b|\bcerto dia\b|\bprimeira vez que\b|\bvou[- ]te contar\b|\bvou contar\b)`,
    "i",
  ),
  transition: ure(
    String.raw`^\s*(?:ent[ãa]o|bora|vamos (?:l[áa]|avan[çc]ar|seguir|continuar|em frente|ao pr[óo]ximo|para o|pro)|pr[óo]ximo (?:ponto|passo|t[óo]pico)|agora (?:vamos|vou|sim)|passando (?:para|pro)|segundo (?:ponto|passo)|terceiro (?:ponto|passo)|ok|beleza|certo|muito bem|perfeito|bom|pronto)\b`,
    "i",
  ),
  technical: ure(
    String.raw`(\bconfigur(?:a|ar|am|a[çc][ãa]o|a[çc][õo]es)\b|\bclic(?:a|ar) em\b|\bmenu\b|\bdefini[çc][õo]es\b|\bferramenta\b|\bsoftware\b|\baplica[çc][ãa]o\b|\baplicativo\b|\bplataforma\b|\bpasso a passo\b|\binstalar?\b|\blogin\b|\bsenha\b|\bpalavra-passe\b|\burl\b|\bdom[íi]nio\b|\bservidor\b|\bintegra[çc][ãa]o\b|\bapi\b|\bpixel\b|\bplanilha\b|\bfolha de c[áa]lculo\b|\bpainel\b|\bdashboard\b|\bc[óo]digo\b|\bscript\b|\btemplate\b|\becr[ãa]\b|\btela de\b)`,
    "i",
  ),
  filler: ure(
    String.raw`(?:^|[,.;\s])\s*(?:ok|okay|certo|beleza|t[áa]|n[ée]|entendeu|entenderam|viu|viram|tranquilo|combinado|t[áa] bom|t[áa] bem|percebe[sm]?|percebeste|percebido|sim)\s*\?\s*$`,
    "i",
  ),
  selfAnswer: ure(
    String.raw`^\s*(?:é|e|a resposta|porque|pq|simples|n[ãa]o[,.]|sim[,.]? (?:é|porque)|exatamente|exactamente|a verdade|o problema|eu (?:vou|digo)|deixa[- ]me)`,
    "i",
  ),
  keyword: ure(
    String.raw`\b(?:[eE]screv(?:e|am)|[dD]igit(?:a|em)|[mM]and(?:a|em)|[cC]olo(?:ca|quem|que)|[pP][õo]e)\s+(?:a[ií]\s+|aqui\s+|no chat\s+)?(?:a palavra\s+)?["“«']?([A-ZÁÉÍÓÚÂÊÔÃÕÇ]{2,}|\d{1,2})["”»']?`,
    "",
  ),
  locationAsk: ure(
    String.raw`\b(?:de onde|d[eao] que (?:cidade|pa[íi]s|prov[íi]ncia)|qual (?:é )?(?:a )?(?:tua|sua|vossa) cidade|onde (?:é que )?(?:est[ãa]o|voc[êe]s est[ãa]o|t[ãa]o)|cidade|pa[íi]s)\b`,
    "i",
  ),
  numberAsk: ure(
    String.raw`\b(?:quantos?|quanto tempo|quanto (?:é que )?(?:factur|fatur|ganh|vend)|h[áa] quanto tempo|que idade|quantas)\b`,
    "i",
  ),
  nameAsk: ure(
    String.raw`\b(?:(?:o )?(?:teu|seu|vosso) nome|como (?:é que )?(?:te chamas|se chama|voc[êe] se chama))\b`,
    "i",
  ),
  emojiAsk: ure(
    String.raw`\b(?:emoji|cora[çc][ãa]o|foguinho|fogo|joinha|palmas|like)\b|🔥|❤️|👏`,
    "i",
  ),
  longAsk: ure(
    String.raw`\b(?:conta|contem|explica|expliquem|porqu[êe]|qual (?:é )?(?:a )?(?:maior|principal) (?:dificuldade|d[úu]vida|desafio|problema)|o que (?:é que )?(?:te|vos|os) (?:impede|trava|bloqueia))\b`,
    "i",
  ),
};

const NAME_STOP = new Set(
  [
    "Chat",
    "Deus",
    "Eu",
    "Então",
    "Agora",
    "Hoje",
    "Internet",
    "Facebook",
    "Instagram",
    "WhatsApp",
    "Google",
    "YouTube",
    "Youtube",
    "Zoom",
    "Portugal",
    "Angola",
    "Brasil",
    "Moçambique",
    "Lisboa",
    "Luanda",
    "Maputo",
    "Segunda",
    "Terça",
    "Quarta",
    "Quinta",
    "Sexta",
    "Sábado",
    "Domingo",
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
    "Bom",
    "Boa",
    "Olá",
    "Ora",
    "Pessoal",
    "Gente",
    "Malta",
    "Galera",
    "Obrigado",
    "Obrigada",
    // Palavras que abrem frases com vírgula a seguir («Depois, …»): não são nomes lidos.
    "Depois",
    "Assim",
    "Primeiro",
    "Segundo",
    "Terceiro",
    "Olha",
    "Olhem",
    "Claro",
    "Sim",
    "Não",
    "Enfim",
    "Inclusive",
    "Lembrando",
    "Aliás",
    "Aqui",
    "Ali",
    "Mas",
    "Porque",
    "Porém",
    "Entretanto",
    "Além",
    "Ainda",
    "Também",
    "Talvez",
    "Nossa",
    "Tipo",
    "Vamos",
    "Isso",
    "Isto",
    "Esse",
    "Essa",
    "Este",
    "Esta",
    "Aquele",
    "Aquela",
    "Ele",
    "Ela",
    "Eles",
    "Elas",
    "Nós",
    "Você",
    "Vocês",
    "Quem",
    "Qual",
    "Quando",
    "Onde",
    "Como",
    "Quanto",
    "Muito",
    "Sempre",
    "Nunca",
    "Beleza",
    "Perfeito",
    "Exato",
    "Exatamente",
    "Exactamente",
    "Certo",
    "Legal",
    "Show",
    "Top",
    "Pronto",
    "Bora",
    "Vem",
    "Veja",
    "Vejam",
    "Repara",
    "Reparem",
    "Atenção",
    "Importante",
    "Lembra",
    "Lembrem",
    "Imagina",
    "Imaginem",
    "Pensa",
    "Pensem",
    "Nota",
    "Detalhe",
    "Resumindo",
    "Basicamente",
    "Simplesmente",
    "Realmente",
    "Finalmente",
    "Agora",
  ].map((w) => w.toLocaleLowerCase("pt")),
);

/** Cidades e países que as pessoas dizem de onde vêem. */
export const KNOWN_PLACES = [
  "Luanda",
  "Benguela",
  "Huambo",
  "Lubango",
  "Lobito",
  "Cabinda",
  "Malanje",
  "Namibe",
  "Uíge",
  "Soyo",
  "Viana",
  "Cazenga",
  "Talatona",
  "Kilamba",
  "Sumbe",
  "Menongue",
  "Saurimo",
  "Dundo",
  "Ondjiva",
  "Caxito",
  "N'dalatando",
  "Cuito",
  "Maputo",
  "Matola",
  "Beira",
  "Nampula",
  "Quelimane",
  "Tete",
  "Chimoio",
  "Pemba",
  "Xai-Xai",
  "Inhambane",
  "Nacala",
  "Lichinga",
  "Maxixe",
  "Dondo",
  "Angoche",
  "São Paulo",
  "Rio de Janeiro",
  "Belo Horizonte",
  "Salvador",
  "Fortaleza",
  "Recife",
  "Curitiba",
  "Porto Alegre",
  "Brasília",
  "Manaus",
  "Goiânia",
  "Campinas",
  "Belém",
  "Florianópolis",
  "Natal",
  "Maceió",
  "João Pessoa",
  "Vitória",
  "Cuiabá",
  "Campo Grande",
  "São Luís",
  "Teresina",
  "Aracaju",
  "Londrina",
  "Sorocaba",
  "Niterói",
  "Santos",
  "Uberlândia",
  "Joinville",
  "Ribeirão Preto",
  "Lisboa",
  "Porto",
  "Braga",
  "Coimbra",
  "Faro",
  "Setúbal",
  "Aveiro",
  "Leiria",
  "Funchal",
  "Guimarães",
  "Viseu",
  "Évora",
  "Sintra",
  "Cascais",
  "Almada",
  "Amadora",
  "Loures",
  "Odivelas",
  "Matosinhos",
  "Gaia",
  "Vila Nova de Gaia",
  "Viana do Castelo",
  "Ponta Delgada",
  "Portimão",
  "Santarém",
  "Bragança",
  "Beja",
  "Angola",
  "Moçambique",
  "Brasil",
  "Portugal",
  "Cabo Verde",
  "Praia",
  "Mindelo",
  "Guiné-Bissau",
  "Bissau",
  "São Tomé",
  "Timor",
  "França",
  "Paris",
  "Luxemburgo",
  "Suíça",
  "Genebra",
  "Zurique",
  "Inglaterra",
  "Londres",
  "Alemanha",
  "Berlim",
  "Espanha",
  "Madrid",
  "Barcelona",
  "Bélgica",
  "Bruxelas",
  "Holanda",
  "Amesterdão",
  "Itália",
  "Milão",
  "Roma",
  "Irlanda",
  "Dublin",
  "Estados Unidos",
  "Nova Iorque",
  "Miami",
  "Boston",
  "Canadá",
  "Toronto",
  "África do Sul",
  "Joanesburgo",
  "Namíbia",
  "Windhoek",
  "Dubai",
  "Macau",
  "Goa",
] as const;

const PLACE_SET = new Set(KNOWN_PLACES.map((p) => p.toLocaleLowerCase("pt")));

function words(text: string) {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** A categoria interactiva de uma frase, para cada pedido ficar num bloco só dele. */
function interactiveCategory(text: string): string {
  if (RE.reading.test(text) || NAME_READ_ONCE.test(text) || NAME_CUED_ONCE.test(text)) return "leitura";
  if (RE.response.test(text)) return "resposta";
  if (RE.request.test(text) && RE.locationAsk.test(text)) return "pedido";
  if (RE.feedback.test(text)) return "confirmacao";
  if (RE.request.test(text)) return "pedido";
  const stripped = stripFillers(text);
  if (RE.poll.test(stripped) && RE.question.test(stripped)) return "sondagem";
  if (RE.question.test(stripped) && RE.secondPerson.test(stripped) && words(stripped).length <= 30)
    return "pergunta";
  return "";
}

/** Frases → blocos de 10 a 30 s, cortados nas pausas; os pedidos ao público ficam sozinhos. */
export function groupSentences(sentences: readonly SentenceLike[]): SentenceLike[][] {
  const ordered = [...sentences].filter((s) => s.text.trim()).sort((a, b) => a.startMs - b.startMs);
  const groups: SentenceLike[][] = [];
  let group: SentenceLike[] = [];
  let groupCategory = "";
  const flush = () => {
    if (group.length) groups.push(group);
    group = [];
    groupCategory = "";
  };
  for (const sentence of ordered) {
    const category = interactiveCategory(sentence.text);
    const previous = group[group.length - 1];
    if (previous) {
      const pause = sentence.startMs - previous.endMs;
      const length = sentence.endMs - group[0]!.startMs;
      const count =
        group.reduce((n, s) => n + words(s.text).length, 0) + words(sentence.text).length;
      if (
        pause > BLOCK_PAUSE_MS ||
        length > BLOCK_MAX_MS ||
        count > BLOCK_MAX_WORDS ||
        category !== groupCategory
      )
        flush();
    }
    group.push(sentence);
    groupCategory = category;
  }
  flush();
  return groups;
}

export type RuleClassification = {
  type: BlockType;
  confidence: number;
  interaction: InteractionType;
  expectsResponse: boolean;
  rhetorical: boolean;
  readsChat: boolean;
  keyword: string | null;
};

function interactionFor(type: BlockType, text: string): InteractionType {
  if (type === "FEEDBACK_REQUEST") {
    if (RE.emojiAsk.test(text)) return "EMOJI";
    if (/\b(?:um 1|escrev(?:e|am) 1|manda(?:m)? 1|o n[úu]mero 1)\b/i.test(text)) return "NUMBER";
    return "YES_NO";
  }
  if (type === "POLL") {
    if (/\b(?:1|um)\b[^.?!]{0,40}\b(?:2|dois)\b/i.test(text)) return "NUMBER";
    if (RE.locationAsk.test(text)) return "LOCATION";
    return "YES_NO";
  }
  if (type === "COMMENT_REQUEST") {
    if (RE.locationAsk.test(text)) return "LOCATION";
    if (RE.nameAsk.test(text)) return "NAME";
    if (RE.keyword.test(text)) return "KEYWORD";
    if (RE.numberAsk.test(text)) return "NUMBER";
    if (RE.emojiAsk.test(text)) return "EMOJI";
    if (RE.longAsk.test(text)) return "LONG_ANSWER";
    return "SHORT_ANSWER";
  }
  if (type === "QUESTION_TO_AUDIENCE") {
    if (RE.locationAsk.test(text)) return "LOCATION";
    if (RE.numberAsk.test(text)) return "NUMBER";
    if (RE.longAsk.test(text)) return "LONG_ANSWER";
    if (
      /^\s*(?:quem|algu[ée]m|j[áa]|voc[êe]s? (?:j[áa]|t[êe]m|tem|conhece|sabe)|tu (?:j[áa]|tens)|concordam|conseguem)\b/i.test(
        text,
      )
    )
      return "YES_NO";
    return "SHORT_ANSWER";
  }
  if (
    type === "SOCIAL_PROOF" ||
    type === "EMOTIONAL_MOMENT" ||
    type === "STORY" ||
    type === "OFFER" ||
    type === "CTA" ||
    type === "CHAT_READING" ||
    type === "CHAT_RESPONSE"
  )
    return "REACTION";
  return "NONE";
}

/** Classificação por regras de um bloco de fala. */
/** Tira as muletas finais ("ok?", "certo?", "né?"): não são perguntas ao público. */
export function stripFillers(text: string): string {
  let out = text.trim();
  for (let i = 0; i < 3; i += 1) {
    const next = out.replace(RE.filler, "");
    if (next === out) break;
    out = next.trim();
  }
  return out;
}

function lastSentence(text: string) {
  const parts = text.split(/(?<=[.!?…])\s+/u).filter(Boolean);
  return parts[parts.length - 1] ?? text;
}

export function classifyText(text: string): RuleClassification {
  const clean = text.trim();
  const count = words(clean).length;
  const stripped = stripFillers(clean);
  const tail = lastSentence(stripped);
  // Só a última frase decide se é pergunta ao público, e tem de ser curta e dirigida a quem vê.
  const question = RE.question.test(stripped) && words(tail).length <= 30;
  const second = question && RE.secondPerson.test(tail);
  const rhetorical = question && (!second || RE.rhetorical.test(tail));
  const keywordMatch = clean.match(RE.keyword);
  const keyword = keywordMatch?.[1] ? keywordMatch[1].toUpperCase() : null;

  const done = (
    type: BlockType,
    confidence: number,
    overrides: Partial<RuleClassification> = {},
  ): RuleClassification => {
    const interaction = overrides.interaction ?? interactionFor(type, clean);
    const expects =
      overrides.expectsResponse ??
      (type === "QUESTION_TO_AUDIENCE" ||
        type === "COMMENT_REQUEST" ||
        type === "FEEDBACK_REQUEST" ||
        type === "POLL");
    return {
      type,
      confidence,
      interaction,
      expectsResponse: expects,
      rhetorical: overrides.rhetorical ?? false,
      readsChat: overrides.readsChat ?? (type === "CHAT_READING" || type === "CHAT_RESPONSE"),
      keyword: overrides.keyword ?? (type === "COMMENT_REQUEST" ? keyword : null),
    };
  };

  const named = extractReferences(clean).some((item) => item.kind === "name");
  if (RE.reading.test(clean) || named) {
    // "Letícia, Joana, sejam bem-vindas. Coloquem aqui quanto já faturaram": nomeia e pede. O pedido é
    // que abre a janela de respostas; os nomes ficam (readsChat) para a presença delas antes.
    if (named && RE.request.test(clean)) return done("COMMENT_REQUEST", 0.85, { readsChat: true });
    if (RE.response.test(clean) && !named) return done("CHAT_RESPONSE", 0.75);
    return done("CHAT_READING", named ? 0.9 : 0.75);
  }
  if (RE.response.test(clean)) return done("CHAT_RESPONSE", 0.7);
  if (RE.request.test(clean) && RE.locationAsk.test(clean)) return done("COMMENT_REQUEST", 0.85);
  if (RE.feedback.test(clean)) return done("FEEDBACK_REQUEST", 0.8);
  if (RE.request.test(clean)) return done("COMMENT_REQUEST", 0.85);
  if (
    RE.poll.test(stripped) &&
    (question || /\blevant/i.test(clean) || /\b(?:1|um)\b[^.?!]{0,40}\b(?:2|dois)\b/i.test(clean))
  )
    return done("POLL", 0.8);
  if (question && second && !rhetorical) return done("QUESTION_TO_AUDIENCE", 0.7);
  if (question && second && rhetorical)
    return done("CONTENT", 0.55, { rhetorical: true, expectsResponse: false });
  if (question && !second)
    return done("CONTENT", 0.6, { rhetorical: true, expectsResponse: false });
  if (RE.cta.test(clean)) return done("CTA", 0.8);
  if (RE.socialProof.test(clean)) return done("SOCIAL_PROOF", 0.6);
  if (RE.offer.test(clean)) return done("OFFER", 0.7);
  if (RE.emotional.test(clean)) return done("EMOTIONAL_MOMENT", 0.55);
  if (RE.story.test(clean)) return done("STORY", 0.55);
  if (RE.technical.test(clean)) return done("TECHNICAL", 0.55);
  if (count <= 8 && RE.transition.test(clean)) return done("TRANSITION", 0.6);
  if (count < 4) return done("OTHER", 0.4);
  return done("CONTENT", 0.5);
}

const NAME_VERBS = String.raw`(?:diz|disse|pergunta|perguntou|escreveu|escreve|comenta|comentou|colocou|coloca|deixou|postou|mandou|manda|falou|fala|respondeu|quer saber|est[áa] a (?:dizer|perguntar)|t[áa] (?:dizendo|perguntando|falando)|a dizer|a perguntar)`;
const NAME = String.raw`(\p{Lu}\p{Ll}{2,}(?:\s\p{Lu}\p{Ll}{2,})?)`;
const PLACE_TAIL = String.raw`(?:\s(?:de|do|da)\s(\p{Lu}[\p{L}'-]{2,}(?:\s(?:de|do|da)\s\p{Lu}[\p{L}'-]{2,})?))?`;
const NAME_READ_SOURCE = String.raw`(?:\b(?:[oOaA]|[dD][oOaA]|[aA][oO]|[Àà])\s+)${NAME}${PLACE_TAIL},?\s+${NAME_VERBS}\b`;
const NAME_READ = ure(NAME_READ_SOURCE, "g");
const NAME_READ_ONCE = ure(NAME_READ_SOURCE);
const NAME_CUED_ONCE = ure(
  String.raw`\b(?:[oOaA]|[dD][oOaA]|[àÀ])\s+(?:minha|meu|nossa|nosso)\s+(?:alun[oa]|cliente|amig[oa]|querid[oa]|colega|parceir[oa]|mentorad[oa])\s+${NAME}`,
);
/** "vejo aqui a Mariana de Luanda, o Pedro do Porto": nomes lidos sem verbo. */
const NAME_LISTED = ure(
  String.raw`(?:^|[,;]|\b[eE]\b|\b[vV]ejo aqui\b|\b[tT]emos aqui\b|\b[tT]em aqui\b|\b[eE]stou a ver\b|\b[tT][ôo] vendo\b|\b[eE]stou vendo\b|\b[vV]i aqui\b|\b[oO]brigad[oa])\s*(?:[oOaA])\s+${NAME}${PLACE_TAIL}`,
  "g",
);
/**
 * "está aqui a minha aluna Letícia", "temos aqui o nosso cliente Pedro": a palavra que apresenta a pessoa
 * (aluna, cliente, amiga…) chega para aceitar o nome, conhecido ou não.
 */
const NAME_CUED = ure(
  String.raw`\b(?:[oOaA]|[dD][oOaA]|[àÀ])\s+(?:minha|meu|nossa|nosso)\s+(?:alun[oa]|cliente|amig[oa]|querid[oa]|colega|parceir[oa]|mentorad[oa])\s+${NAME}${PLACE_TAIL}`,
  "g",
);
/**
 * O apresentador lê o chat nome a nome, com o que cada um escreveu a seguir: "Letícia, 5 mil. Joana, 2 mil
 * euros." Só com um nome conhecido ou com um número no conteúdo, para «Depois, …» e «Olha, …» não contarem.
 */
const NAME_THEN_CONTENT = ure(
  String.raw`(?:^|[.!?…]\s+|\b[óo][,.]?\s+)${NAME}\s*,\s*([^.?!,;]{1,80})(?=[.?!;]|$)`,
  "gm",
);
const NAME_PROOF = ure(
  String.raw`(?:^|[.!?…]\s+)${NAME},?\s+(?:que\s+)?[^.?!]{0,80}\b(?:faturou|facturou|fez|vendeu|conseguiu|fechou|ganhou|entrou|come[çc]ou|recebeu|lucrou)\b[^.?!]{0,80}`,
  "g",
);
/** Um valor lido em voz alta ("Olha só! 5 mil euros?", "2 mil?"): só números, com ou sem moeda. */
const AMOUNT_TOKEN = String.raw`\d[\d.,]*\s*(?:mil|k)?\s*(?:euros?|reais|kwanzas|meticais|d[óo]lares|€|R\$)?`;
const AMOUNT_READ = ure(
  String.raw`^\s*(?:(?:olha|olhem|olha s[óo]|vejam|uau|nossa|caramba)[!,.]?\s*)*(?:${AMOUNT_TOKEN}\s*[?!.,]*\s*)+$`,
  "i",
);
const AMOUNT_EACH = ure(AMOUNT_TOKEN, "gi");
const THANKS = ure(String.raw`obrigad[oa],?\s+(\p{Lu}\p{Ll}{2,})\b`, "g");
const PLACE_READ = ure(
  String.raw`\b(?:de|da|do|em|desde|até)\s+(\p{Lu}[\p{L}'-]{2,}(?:\s(?:de|do|da|dos|das)\s\p{Lu}[\p{L}'-]{2,}|\s\p{Lu}[\p{L}'-]{2,})?)`,
  "g",
);
const QUESTION_READ = ure(
  String.raw`(?:pergunt(?:a|ou)|quer saber|quest[ãa]o(?: é| e)?|d[úu]vida(?: é| e)?)\s*(?:é\s+)?(?:se|como|o que|qual|quando|quanto|por ?qu[eê]|onde|aonde)\s+([^.?!]{6,140})`,
  "gi",
);
const KNOWN_FIRST = new Set(
  namePool(["ao", "mz", "br", "pt"]).map((full) => full.split(" ")[0]!.toLocaleLowerCase("pt")),
);

function acceptName(name: string) {
  const key = name.toLocaleLowerCase("pt");
  return !NAME_STOP.has(key) && !PLACE_SET.has(key);
}

/** O que o apresentador leu do chat: nomes, cidades e perguntas. */
export function extractReferences(text: string): ReferencedItem[] {
  const out: ReferencedItem[] = [];
  const seen = new Set<string>();
  const add = (item: ReferencedItem) => {
    const key = `${item.kind}:${(item.name ?? "").toLocaleLowerCase("pt")}:${item.text.toLocaleLowerCase("pt")}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  const questions = [...text.matchAll(QUESTION_READ)].map((m) => m[0].trim());

  const attached = new Set<string>();
  for (const match of text.matchAll(NAME_READ)) {
    const name = match[1]!.trim();
    if (!acceptName(name)) continue;
    const place = match[2]?.trim() ?? null;
    if (place) attached.add(place.toLocaleLowerCase("pt"));
    // A pergunta que vem a seguir ao nome, na mesma frase, é dela.
    const after = text.slice(match.index! + match[0].length);
    const q = after.match(
      /^\s*(?:é\s+)?(?:se|como|o que|qual|quando|quanto|por ?qu[eê]|onde|aonde)\s+([^.?!]{4,140})/iu,
    );
    // "colocou ali", "escreveu aqui no chat": o advérbio não é o que a pessoa escreveu.
    const said = after
      .replace(/^\s*(?:aqui|ali|a[ií]|agora|também|no chat|nos coment[áa]rios|l[áa])(?:\s+(?:no chat|nos coment[áa]rios|em ?baixo))?/iu, "")
      .match(/^\s*(?:que\s+)?["“«]?([^.?!"”»]{4,140})/u);
    const quote = said && said[1]!.trim().split(/\s+/).length >= 2 ? said[1]!.trim() : "";
    add({ kind: "name", name, place, text: q ? q[0].trim() : quote });
  }
  for (const match of text.matchAll(THANKS)) {
    const name = match[1]!.trim();
    if (!acceptName(name)) continue;
    add({ kind: "name", name, place: null, text: "" });
  }
  // "Alessandra, que entrou faz uma semana, já faturou 400 euros": o nome abre a frase e a frase conta
  // um resultado dela (com um número, ou um nome conhecido).
  for (const match of text.matchAll(NAME_PROOF)) {
    const name = match[1]!.trim();
    const first = name.split(" ")[0]!.toLocaleLowerCase("pt");
    if (!acceptName(name)) continue;
    if (!KNOWN_FIRST.has(first) && !/\d/.test(match[0])) continue;
    if (out.some((item) => item.kind === "name" && item.name === name)) continue;
    add({ kind: "name", name, place: null, text: "" });
  }
  // "a minha aluna Letícia": a apresentação da pessoa chega, seja o nome conhecido ou não.
  for (const match of text.matchAll(NAME_CUED)) {
    const name = match[1]!.trim();
    if (!acceptName(name)) continue;
    const place = match[2]?.trim() ?? null;
    if (place) attached.add(place.toLocaleLowerCase("pt"));
    if (out.some((item) => item.kind === "name" && item.name === name)) continue;
    add({ kind: "name", name, place, text: "" });
  }
  // Nomes lidos em lista, sem verbo: só nomes conhecidos ou seguidos da cidade. Numa lista de vários
  // ("Letícia, a Joana, a Lúcia, a Alice"), a própria lista é a prova: entram todos, e também o primeiro
  // nome quando abre a frase sem artigo.
  const listed = [...text.matchAll(NAME_LISTED)]
    .map((match) => ({ name: match[1]!.trim(), place: match[2]?.trim() ?? null }))
    .filter((item) => acceptName(item.name));
  const series = listed.length >= 2;
  if (series) {
    const opener = text.match(ure(String.raw`^\s*${NAME}\s*,\s*[oOaA]\s+\p{Lu}`));
    if (opener && acceptName(opener[1]!.trim()) && !listed.some((item) => item.name === opener[1]!.trim()))
      listed.unshift({ name: opener[1]!.trim(), place: null });
  }
  for (const { name, place } of listed) {
    const first = name.split(" ")[0]!.toLocaleLowerCase("pt");
    if (!series && !KNOWN_FIRST.has(first) && !place) continue;
    if (place) attached.add(place.toLocaleLowerCase("pt"));
    if (out.some((item) => item.kind === "name" && item.name === name)) continue;
    add({ kind: "name", name, place, text: "" });
  }
  // "Letícia, 5 mil. Joana, 2 mil euros.": o nome e, a seguir, o que a pessoa escreveu.
  for (const match of text.matchAll(NAME_THEN_CONTENT)) {
    const name = match[1]!.trim();
    const content = match[2]!.trim();
    const first = name.split(" ")[0]!.toLocaleLowerCase("pt");
    if (!acceptName(name) || !content) continue;
    const known = KNOWN_FIRST.has(first) || out.some((item) => item.kind === "name" && item.name === name);
    // Só conteúdos com números ("5 mil", "2 mil euros", "97 euros?") ou entre aspas: "Mariana, que bom
    // ver-te" é o apresentador a falar com ela, não a ler o que ela escreveu.
    const quoted = /^["“«'].+["”»']$/u.test(content);
    if (!/\d/.test(content) && !(known && quoted)) continue;
    if (/^(?:[oOaA]|[eE])\s+\p{Lu}/u.test(content)) continue;
    const existing = out.find((item) => item.kind === "name" && item.name === name);
    if (existing) {
      if (!existing.text) existing.text = content;
      continue;
    }
    add({ kind: "name", name, place: null, text: content });
  }
  for (const match of text.matchAll(PLACE_READ)) {
    const place = match[1]!.trim();
    const key = place.toLocaleLowerCase("pt");
    if (PLACE_SET.has(key) && !attached.has(key))
      add({ kind: "city", name: null, place, text: place });
  }
  for (const q of questions) {
    if (out.some((item) => item.kind === "name" && item.text && q.includes(item.text))) continue;
    add({ kind: "question", name: null, place: null, text: q });
  }
  return out;
}

function timeOf(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** Blocos com sentido a partir das frases, só com regras. */
export function buildSemanticBlocks(sentences: readonly SentenceLike[]): SemanticBlock[] {
  const groups = groupSentences(sentences);
  const blocks: SemanticBlock[] = [];
  groups.forEach((group, index) => {
    const text = group.map((s) => s.text.trim()).join(" ");
    const rule = classifyText(text);
    const referenced = rule.readsChat ? extractReferences(text) : [];
    const first = group[0]!;
    const last = group[group.length - 1]!;
    blocks.push({
      id: `b${index + 1}_${timeOf(first.startMs).replace(":", "")}`,
      startMs: first.startMs,
      endMs: Math.max(last.endMs, first.startMs),
      text,
      sentenceIds: group.map((s) => s.id),
      type: rule.type,
      confidence: rule.confidence,
      interaction: rule.interaction,
      expectsResponse: rule.expectsResponse,
      rhetorical: rule.rhetorical,
      readsChat: rule.readsChat,
      referenced,
      keyword: rule.keyword,
      source: "regras",
      gapAfterMs: 0,
    });
  });

  // "Deixe aqui nos comentários" logo a seguir à pergunta: é a mesma oportunidade.
  // Junta-se à pergunta, para a janela de resposta começar depois do pedido.
  const GENERIC_REQUEST = ure(
    String.raw`^\s*(?:ent[ãa]o,?\s*)?(?:deix(?:a|e|em|am)|escrev(?:e|a|am)|coment(?:a|e|em)|colo(?:ca|cam|que|quem)|mand(?:a|e|em))\s+(?:aqui\s+|a[ií]\s+)?(?:nos coment[áa]rios|no chat)[.!]?\s*$`,
    "i",
  );
  for (let i = blocks.length - 1; i > 0; i -= 1) {
    const block = blocks[i]!;
    const previous = blocks[i - 1]!;
    if (
      block.type === "COMMENT_REQUEST" &&
      GENERIC_REQUEST.test(block.text) &&
      previous.expectsResponse &&
      block.startMs - previous.endMs <= 2500
    ) {
      previous.endMs = Math.max(previous.endMs, block.endMs);
      previous.text = `${previous.text} ${block.text}`.trim();
      previous.sentenceIds = [...previous.sentenceIds, ...block.sentenceIds];
      previous.confidence = Math.max(previous.confidence, 0.85);
      blocks.splice(i, 1);
    }
  }

  // Pergunta seguida logo pela própria resposta do apresentador: é retórica.
  for (let i = 0; i < blocks.length - 1; i += 1) {
    const block = blocks[i]!;
    const next = blocks[i + 1]!;
    if (
      block.type === "QUESTION_TO_AUDIENCE" &&
      !RE.request.test(block.text) &&
      next.startMs - block.endMs < 1200 &&
      RE.selfAnswer.test(next.text)
    ) {
      block.type = "CONTENT";
      block.rhetorical = true;
      block.expectsResponse = false;
      block.interaction = "NONE";
      block.confidence = 0.5;
    }
  }

  // Um valor solto, lido em voz alta, até 4 minutos depois de um pedido ao público ("quanto
  // cobrariam?" … "Olha só! 5 mil euros? 2 mil?"): é o apresentador a ler as respostas.
  for (let i = 0; i < blocks.length; i += 1) {
    const block = blocks[i]!;
    if (block.type === "CHAT_READING" || !AMOUNT_READ.test(block.text)) continue;
    const ask = blocks
      .slice(0, i)
      .reverse()
      .find((b) => b.expectsResponse && block.startMs - b.endMs <= 240_000);
    if (!ask) continue;
    const amounts = [...block.text.matchAll(AMOUNT_EACH)].map((m) => m[0].trim()).filter(Boolean);
    if (amounts.length === 0) continue;
    block.type = "CHAT_READING";
    block.readsChat = true;
    block.expectsResponse = false;
    block.interaction = "REACTION";
    block.confidence = Math.max(block.confidence, 0.8);
    block.referenced = amounts.map((text) => ({ kind: "message" as const, name: null, place: null, text }));
  }

  // Silêncios: ninguém reage ao nada, mas o vazio fica registado.
  const withSilence: SemanticBlock[] = [];
  blocks.forEach((block, index) => {
    withSilence.push(block);
    const next = blocks[index + 1];
    const gap = next ? next.startMs - block.endMs : 0;
    block.gapAfterMs = Math.max(0, gap);
    if (gap >= SILENCE_MIN_MS) {
      withSilence.push({
        id: `${block.id}_sil`,
        startMs: block.endMs,
        endMs: next!.startMs,
        text: "",
        sentenceIds: [],
        type: "SILENCE",
        confidence: 0.95,
        interaction: "NONE",
        expectsResponse: false,
        rhetorical: false,
        readsChat: false,
        referenced: [],
        keyword: null,
        source: "regras",
        gapAfterMs: 0,
      });
    }
  });
  return withSilence;
}

/** O bloco em que um instante cai, ou o mais próximo até 20 s. */
export function blockAt(blocks: readonly SemanticBlock[], ms: number): SemanticBlock | null {
  let best: SemanticBlock | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const block of blocks) {
    if (ms >= block.startMs && ms <= block.endMs) return block;
    const d = ms < block.startMs ? block.startMs - ms : ms - block.endMs;
    if (d < distance) {
      distance = d;
      best = block;
    }
  }
  return distance <= 20_000 ? best : null;
}
