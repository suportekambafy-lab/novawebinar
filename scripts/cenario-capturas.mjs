#!/usr/bin/env node
/**
 * Cenário das capturas do site: a conta fictícia «Escola Vende+» (organizations.is_test), com uma
 * utilizadora própria, uma sala de demonstração com vídeo curto, chat e oferta, e três webinars com
 * inscrições, tempo visto, oferta, compras e conversas inventadas, para o painel ter o que mostrar.
 * Nada aqui é real: nomes, emails (@example.com), cidades e valores são inventados.
 *
 *   node scripts/cenario-capturas.mjs criar [--app http://127.0.0.1:8080]
 *   node scripts/cenario-capturas.mjs limpar
 *
 * Os media (vídeo, capa, avatar) ficam em public/__teste-capturas (ignorado pelo git) e são servidos
 * pela aplicação local; por isso os endereços gravados só funcionam com a aplicação a correr.
 * Para as capturas do site (src/assets/landing) cada webinar leva um vídeo diferente, gerado com o ffmpeg
 * (fundos de estúdio abstractos: live-vertical.mp4 em 9:16, aula-azul/verde/roxo.mp4 em 16:9), ligado
 * depois de criar: video_sources por vídeo, webinars.video_source_id, chat_settings.live.desk «vertical»
 * no de 9:16, e os comentários, a oferta e as compras simuladas da sala copiados para os outros três.
 * A palavra-passe da utilizadora fica em .scratch/capturas.json (ignorado pelo git).
 * Lê o .env; nenhum segredo é impresso.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

const SLUG = "escola-vende-mais-capturas";
const EMAIL = "rui.capturas@example.com";
const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }),
);
const [command, ...rest] = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
const APP = arg("app", "http://127.0.0.1:8080").replace(/\/+$/, "");
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function api(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${url.split("?")[0]}: ${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}
const db = (path, init) => api(`${env.SUPABASE_URL}/rest/v1/${path}`, init);
const insert = async (table, rows) => {
  const list = Array.isArray(rows) ? rows : [rows];
  const out = [];
  // Em lotes de 50: o gateway não gosta de pedidos enormes.
  for (let i = 0; i < list.length; i += 50) {
    const chunk = list.slice(i, i + 50);
    out.push(...(await db(table, { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(chunk) })));
  }
  return Array.isArray(rows) ? out : out[0];
};
const patch = (path, body) => db(path, { method: "PATCH", body: JSON.stringify(body) });
const say = (message) => console.log(`[${new Date().toLocaleTimeString("pt-PT")}] ${message}`);

/* ---------- Gerador determinista: as mesmas pessoas em cada corrida ---------- */
let seed = 20261013;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

const FIRST = ["Ana", "Beatriz", "Carla", "Diana", "Eduarda", "Filipa", "Helena", "Inês", "Joana", "Leonor", "Mafalda", "Marta", "Rita", "Sofia", "Teresa", "Vera", "André", "Bruno", "Carlos", "Daniel", "Diogo", "Eduardo", "Fábio", "Gonçalo", "Hugo", "João", "Luís", "Miguel", "Nuno", "Pedro", "Ricardo", "Rui", "Tiago", "Vasco", "Kiala", "Nzinga", "Edson", "Kátia", "Nelson", "Wilson", "Camila", "Larissa", "Rafael", "Thiago"];
const LAST = ["Almeida", "Carvalho", "Costa", "Ferreira", "Fernandes", "Gomes", "Gonçalves", "Lopes", "Marques", "Martins", "Mendes", "Monteiro", "Neves", "Oliveira", "Pereira", "Pinto", "Ribeiro", "Rocha", "Santos", "Silva", "Sousa", "Teixeira", "Vieira", "Domingos", "Francisco", "Manuel", "Sebastião", "Nascimento", "Barbosa"];
const PLACES = [
  ["Lisboa", "Portugal", "PT"], ["Porto", "Portugal", "PT"], ["Braga", "Portugal", "PT"], ["Coimbra", "Portugal", "PT"], ["Faro", "Portugal", "PT"], ["Setúbal", "Portugal", "PT"],
  ["Luanda", "Angola", "AO"], ["Benguela", "Angola", "AO"], ["Huambo", "Angola", "AO"],
  ["São Paulo", "Brasil", "BR"], ["Rio de Janeiro", "Brasil", "BR"], ["Belo Horizonte", "Brasil", "BR"],
  ["Maputo", "Moçambique", "MZ"], ["Praia", "Cabo Verde", "CV"],
];
const SOURCES = ["instagram", "meta_ads", "google", "direto", "youtube", "whatsapp"];
const DEVICES = ["mobile", "mobile", "mobile", "desktop", "desktop", "tablet"];

const usedEmails = new Set();
function person() {
  const first = pick(FIRST);
  const last = pick(LAST);
  let email = `${first}.${last}@example.com`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  let n = 1;
  while (usedEmails.has(email)) {
    n += 1;
    email = email.replace(/(\d*)@/, `${n}@`);
  }
  usedEmails.add(email);
  const [city, country, code] = pick(PLACES);
  return { name: `${first} ${last}`, email, phone: `+351 9${between(10000000, 39999999)}`, city, country, code };
}

const minutesAgo = (m) => new Date(Date.now() - m * 60_000);
const iso = (d) => d.toISOString();

/* ---------- O que fica em cada webinar ---------- */

const MEDIA = {
  video: `${APP}/__teste-capturas/demo.mp4`,
  cover: `${APP}/__teste-capturas/cover.jpg`,
  avatar: `${APP}/__teste-capturas/avatar.png`,
};

const HOST = { host_name: "Rui Carvalho", host_role: "Fundador da Escola Vende+", host_avatar_url: MEDIA.avatar, host_verified: true };
// Para as capturas do site, cada webinar leva depois o apresentador que aparece no seu vídeo (nome, cargo e
// avatar a condizer: Ana Martins no Live vertical, Sofia Almeida na sala do quadro, Rui Carvalho nas outras),
// e as linhas do apresentador no chat ficam com esse nome. Ver as notas no topo deste ficheiro.

/** As opções da sala (chat_settings), no formato «live»: cabeçalho, oferta laranja, sem momentos de seguir. */
const chatSettings = (extra = {}) => ({
  late: true,
  talk: true,
  tone: "natural",
  delay: true,
  emoji: true,
  follow: true,
  mobile: true,
  volume: "normal",
  answers: 4,
  answersOn: true,
  countries: [],
  perMinute: 12,
  entry_mode: "page",
  room_format: "live",
  alunos: { on: true, when: "oferta", count: 3, product: "" },
  live: {
    desk: "horizontal",
    entry: "info",
    links: { instagram: "https://www.instagram.com/escolavendemais" },
    timer: { on: false, end: 0, color: null, model: "bar", start: 0 },
    header: true,
    notify: true,
    moments: [],
    waiting: { video: null, countdown: true },
    countdown: { on: false, after: 5, color: "#E8440C", sound: true, style: "minimal", afterOn: false, minutes: 5, background: { image: null, video: null } },
    offerLook: "square",
    offerColor: "#E8440C",
    offerColors: {},
    hideFollowed: true,
    fullscreenButton: true,
    ...extra,
  },
});

const OFFER = {
  cta_text: "Quero entrar na turma",
  cta_url: "https://exemplo.invalid/checkout/turma-vende-mais",
  cta_price_original: "497 €",
  cta_price_now: "197 €",
  cta_countdown_seconds: 900,
  cta_color: "red",
  offer_pin_title: "Turma Vende+",
  offer_pin_message: "Acesso a 8 módulos, 6 aulas ao vivo e a comunidade. Garantia de 15 dias.",
  sales_show_real: false,
  sales_where: "both",
};

const PAGE = {
  registration_headline: "Vender todos os dias com uma aula gravada",
  registration_subtitle: "Aula gratuita. O método para transformar uma apresentação numa máquina de vendas automática.",
  registration_button_text: "Quero a minha vaga",
  registration_badge_text: "Aula gratuita",
  registration_progress_enabled: true,
  registration_progress_value: 87,
  registration_scarcity_note: "87% das vagas preenchidas",
  registration_cover_url: MEDIA.cover,
  cover_url: MEDIA.cover,
  registration_collect_phone: true,
  registration_require_phone: true,
  chat_pin_title: "Bem-vindo à aula",
  chat_pin_message: "Fique até ao fim: há uma oferta só para quem está na sala.",
  entry_fields: [
    { id: "name", kind: "name", label: "Nome completo", required: true },
    { id: "email", kind: "email", label: "E-mail", required: true },
    { id: "whatsapp", kind: "whatsapp", label: "WhatsApp", required: true },
  ],
};

/** O chat da sala de demonstração: 90 segundos de conversa, a chegar, a perguntar, a reagir. */
const ROOM_CHAT = [
  [2, "Tiago Ferreira", "Boa noite a todos!"],
  [4, "Sofia Henriques", "Boa noite 🙌 a ver de Braga"],
  [6, "Hugo Rocha", "Boas, já cá estamos"],
  [9, "Carla Mendes", "Primeira vez aqui, ansiosa pela aula"],
  [12, "Rui Teixeira", "Luanda presente 🇦🇴"],
  [15, "Inês Lopes", "Dá para ver depois em replay?"],
  [18, "Rui Carvalho", "Inês, sim: quem ficar inscrito recebe o replay por e-mail 👍"],
  [22, "Pedro Neves", "Esse erro dos lançamentos é mesmo o meu 😅"],
  [26, "Leonor Vieira", "Alguém já vende com aula gravada?"],
  [29, "Diogo Marques", "Eu! Desde Março. Mudou tudo"],
  [33, "Kátia Domingos", "Que ferramenta é essa da sala?"],
  [37, "Beatriz Pinto", "Apareceu a oferta 👀"],
  [40, "Nelson Francisco", "Quanto tempo dura a turma?"],
  [43, "Rui Carvalho", "Nelson, 6 semanas com aulas ao vivo e acesso vitalício às gravações"],
  [47, "Marta Gomes", "Vou entrar, já abri o link"],
  [52, "Fábio Santos", "Garantia de 15 dias? Top"],
  [56, "Vera Almeida", "Entrei! 🎉"],
  [60, "Rafael Oliveira", "A ver de São Paulo, isto aplica-se ao Brasil?"],
  [63, "Rui Carvalho", "Rafael, sim: temos alunos no Brasil, Angola e Portugal"],
  [68, "Joana Ribeiro", "Acabei de garantir a minha vaga"],
  [72, "Edson Manuel", "Qual é o melhor dia para fazer a primeira aula?"],
  [77, "Helena Sousa", "Entrei também, vemo-nos na turma"],
  [82, "Camila Barbosa", "Obrigada Mariana, aula incrível"],
];

/* ---------- Criar ---------- */

async function existing() {
  const [org] = await db(`organizations?select=id,name,is_test&slug=eq.${SLUG}`);
  return org ?? null;
}

async function createUser() {
  const password = randomBytes(12).toString("base64url");
  const users = await api(`${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`);
  const found = (users?.users ?? []).find((u) => u.email === EMAIL);
  const user = found
    ? await api(`${env.SUPABASE_URL}/auth/v1/admin/users/${found.id}`, { method: "PUT", body: JSON.stringify({ password }) })
    : await api(`${env.SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        body: JSON.stringify({ email: EMAIL, password, email_confirm: true, user_metadata: { full_name: "Rui Carvalho" } }),
      });
  mkdirSync(new URL("../.scratch/", import.meta.url), { recursive: true });
  writeFileSync(new URL("../.scratch/capturas.json", import.meta.url), JSON.stringify({ email: EMAIL, password, userId: user.id }, null, 2));
  return user.id;
}

async function create() {
  if (await existing()) throw new Error("A conta das capturas já existe. Corra primeiro: node scripts/cenario-capturas.mjs limpar");
  const appUp = await fetch(APP).then((r) => r.ok, () => false);
  if (!appUp) throw new Error(`A aplicação não responde em ${APP}. Arranque-a (npx vite dev --host 127.0.0.1 --port 8080) ou indique --app.`);

  const userId = await createUser();
  await db(`profiles?id=eq.${userId}`, { method: "PATCH", body: JSON.stringify({ full_name: "Rui Carvalho" }) }).catch(() => null);
  const org = await insert("organizations", { name: "Escola Vende+", slug: SLUG, created_by: userId, is_test: true });
  await insert("organization_members", { organization_id: org.id, user_id: userId, role: "owner" });
  say(`Conta «Escola Vende+» criada (${org.id.slice(0, 8)}) com a utilizadora ${EMAIL}.`);

  const video = await insert("video_sources", {
    organization_id: org.id,
    name: "Aula: Vender todos os dias (gravação)",
    provider: "upload",
    source_url: MEDIA.video,
    thumbnail_url: MEDIA.cover,
    duration_seconds: 2700,
    status: "ready",
  });

  // 1. A sala de demonstração: vídeo curto (90 s), chat, oferta aos 35 s, compras a seguir.
  const room = await insert("webinars", {
    organization_id: org.id,
    created_by: userId,
    video_source_id: video.id,
    internal_name: "Sala de demonstração",
    public_title: "Vender todos os dias com uma aula gravada",
    description: "A aula gratuita da Escola Vende+.",
    slug: "aula-vender-todos-os-dias",
    status: "scheduled",
    schedule_mode: "single",
    recurrence_enabled: true,
    recurrence_times: ["20:00"],
    recurrence_days: [],
    timezone: "Europe/Lisbon",
    duration_seconds: 2700,
    pitch_seconds: 20,
    cta_start_seconds: 35,
    replay_enabled: true,
    waiting_room_enabled: true,
    easy_access: false,
    sync_video_with_start: true,
    room_theme: "dark",
    video_format: "live",
    chat_settings: chatSettings(),
    ...HOST,
    ...OFFER,
    ...PAGE,
  });
  await insert(
    "scheduled_comments",
    ROOM_CHAT.map(([at, author, message]) => ({
      webinar_id: room.id,
      organization_id: org.id,
      offset_seconds: at,
      offset_ms: at * 1000,
      author_name: author,
      message,
      comment_type: at < 15 ? "chegada" : "conversa",
    })),
  );
  await insert("audience_configuration", {
    webinar_id: room.id,
    organization_id: org.id,
    mode: "simulated",
    curve: Array.from({ length: 46 }, (_, i) => Math.round(420 + 380 * Math.sin((Math.min(i, 30) / 30) * (Math.PI / 2)) + (i % 3) * 7)),
  });
  await insert("social_proof_settings", {
    webinar_id: room.id,
    organization_id: org.id,
    enabled: true,
    product_name: "Turma Vende+",
    start_mode: "with_offer",
    start_delay_seconds: 0,
    min_interval_seconds: 8,
    max_interval_seconds: 14,
    position: "bottom-left",
    display_seconds: 6,
    animation: "slide",
    templates: [],
  });
  await insert(
    "simulated_purchase_events",
    [["Marta Gomes", 47], ["Vera Almeida", 56], ["Joana Ribeiro", 68], ["Helena Sousa", 77]].map(([buyer, at]) => ({
      organization_id: org.id,
      webinar_id: room.id,
      buyer_name: buyer,
      product_name: "Turma Vende+",
      message: "",
      offset_seconds: at,
    })),
  );
  say(`Sala de demonstração criada: ${APP}/w/${room.slug}?teste=1`);

  // 2. Três webinars com história: inscrições, tempo visto, oferta, compras, conversas.
  const specs = [
    { internal: "Lançamento Vende+ · Turma de Outubro", title: "Lançamento Vende+: a turma de Outubro", slug: "turma-de-outubro", people: 96, daysBack: 21, cta: 2460, pitch: 2100, duration: 2700, next: 2 },
    { internal: "Tráfego pago para negócios locais", title: "Tráfego pago para negócios locais", slug: "trafego-negocios-locais", people: 58, daysBack: 30, cta: 3000, pitch: 2600, duration: 3400, next: 5 },
    { internal: "Masterclass: funil de 7 dias", title: "Masterclass: o funil de 7 dias", slug: "funil-de-7-dias", people: 44, daysBack: 12, cta: 2200, pitch: 1900, duration: 2500, next: 9 },
  ];
  let created = [];
  for (const spec of specs) {
    const nextStart = new Date();
    nextStart.setDate(nextStart.getDate() + spec.next);
    nextStart.setHours(20, 0, 0, 0);
    const webinar = await insert("webinars", {
      organization_id: org.id,
      created_by: userId,
      video_source_id: video.id,
      internal_name: spec.internal,
      public_title: spec.title,
      description: "Aula gratuita da Escola Vende+.",
      slug: spec.slug,
      status: "scheduled",
      schedule_mode: "single",
      scheduled_at: iso(nextStart),
      timezone: "Europe/Lisbon",
      duration_seconds: spec.duration,
      pitch_seconds: spec.pitch,
      cta_start_seconds: spec.cta,
      replay_enabled: true,
      waiting_room_enabled: true,
      sync_video_with_start: true,
      room_theme: "dark",
      video_format: "live",
      chat_settings: chatSettings(),
      ...HOST,
      ...OFFER,
      ...PAGE,
      registration_headline: spec.title,
    });
    // Sessões passadas (uma a cada 3-4 dias) e a próxima.
    const sessions = [];
    for (let d = spec.daysBack; d >= 1; d -= between(3, 4)) {
      const start = new Date();
      start.setDate(start.getDate() - d);
      start.setHours(20, 0, 0, 0);
      const end = new Date(start.getTime() + spec.duration * 1000);
      sessions.push(
        await insert("webinar_sessions", { webinar_id: webinar.id, organization_id: org.id, starts_at: iso(start), ends_at: iso(end), state: "finished", ended_at: iso(end) }),
      );
    }
    await insert("webinar_sessions", { webinar_id: webinar.id, organization_id: org.id, starts_at: iso(nextStart), ends_at: iso(new Date(nextStart.getTime() + spec.duration * 1000)), state: "scheduled" });

    // Pessoas: inscritas nos dias antes de cada sessão; umas vêem tudo, outras saem cedo, outras faltam.
    const rows = [];
    const facts = [];
    for (let i = 0; i < spec.people; i += 1) {
      const p = person();
      const session = pick(sessions);
      const start = new Date(session.starts_at);
      const joined = new Date(start.getTime() - between(10, 60 * 72) * 60_000);
      const r = rand();
      const noShow = r < 0.3;
      const entry = noShow ? 0 : between(0, 9) * 60;
      const watched = noShow ? 0 : r < 0.5 ? between(60, Math.max(120, spec.pitch - 300)) : between(spec.pitch, spec.duration);
      const sawOffer = !noShow && entry + watched >= spec.cta;
      const clicked = sawOffer && rand() < 0.42;
      const device = pick(DEVICES);
      rows.push({
        webinar_id: webinar.id,
        organization_id: org.id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        viewing_mode: rand() < 0.8 ? "live" : "replay",
        device,
        city: p.city,
        country: p.country,
        country_code: p.code,
        joined_at: iso(joined),
        webinar_session_id: session.id,
        entry_seconds: entry,
        watched_seconds: noShow ? 0 : entry + watched,
        actual_watch_seconds: watched,
        first_progress_at: noShow ? null : iso(new Date(start.getTime() + entry * 1000)),
        last_progress_at: noShow ? null : iso(new Date(start.getTime() + (entry + watched) * 1000)),
        last_seen_at: noShow ? null : iso(new Date(start.getTime() + (entry + watched) * 1000)),
        cta_clicked: clicked,
        utm_source: pick(SOURCES),
        utm_medium: "social",
        utm_campaign: "aula-gratuita",
        registration_source: "room",
      });
      facts.push({ p, start, sawOffer, clicked, device });
    }
    const participants = await insert("participants", rows);
    // Oferta vista/clicada, compras (aprovadas, falhadas, abandonadas) e corações.
    const cta = [];
    const purchases = [];
    const hearts = [];
    participants.forEach((participant, i) => {
      const f = facts[i];
      const at = new Date(f.start.getTime() + spec.cta * 1000);
      if (f.sawOffer) cta.push({ organization_id: org.id, webinar_id: webinar.id, participant_id: participant.id, event_type: "view", video_second: spec.cta, occurred_at: iso(at) });
      if (f.clicked) {
        cta.push({ organization_id: org.id, webinar_id: webinar.id, participant_id: participant.id, event_type: "click", video_second: spec.cta + 40, occurred_at: iso(new Date(at.getTime() + 40_000)) });
        const r = rand();
        const status = r < 0.55 ? "approved" : r < 0.72 ? "failed" : r < 0.9 ? "abandoned" : "pending";
        const when = new Date(at.getTime() + between(2, 25) * 60_000);
        purchases.push({
          organization_id: org.id,
          webinar_id: webinar.id,
          buyer_name: f.p.name,
          buyer_email: f.p.email,
          product_name: "Turma Vende+",
          amount: "197",
          amount_value: 197,
          currency: "EUR",
          status,
          source: "webhook",
          provider: "webhook",
          external_id: `cap-${participant.id.slice(0, 8)}`,
          created_at: iso(when),
        });
      }
      if (!f.sawOffer && rand() < 0.3) return;
      if (rows[i].watched_seconds > 0 && rand() < 0.5) {
        hearts.push({ organization_id: org.id, webinar_id: webinar.id, participant_id: participant.id, event_name: "hearts", properties: { count: between(1, 9) }, is_real: true, occurred_at: iso(new Date(f.start.getTime() + between(60, rows[i].watched_seconds) * 1000)) });
      }
    });
    await insert("cta_events", cta);
    await insert("real_purchase_events", purchases);
    if (hearts.length) await insert("analytics_events", hearts);

    // Conversas privadas: perguntas de quem assistiu, com resposta da equipa ou do agente.
    const asks = [
      ["Posso pagar em duas vezes?", "Pode sim: no checkout escolha «2× sem juros». Qualquer dúvida, estamos aqui."],
      ["O replay fica disponível quanto tempo?", "Fica 7 dias na sala; quem entrar na turma tem acesso vitalício às gravações."],
      ["Isto serve para quem ainda não tem produto?", "Serve: o módulo 1 é precisamente sobre criar a oferta a partir do que já sabe."],
      ["Onde recebo o acesso depois de comprar?", "No e-mail do checkout, em poucos minutos. Veja também a pasta de promoções."],
      ["Há garantia?", "Há: 15 dias para experimentar, com devolução total se não for para si."],
    ];
    const askers = participants.filter((_, i) => rows[i].watched_seconds > 600).slice(0, 5);
    for (const [i, participant] of askers.entries()) {
      const [question, answer] = asks[i % asks.length];
      const when = new Date(new Date(rows[participants.indexOf(participant)].first_progress_at).getTime() + between(5, 30) * 60_000);
      const conversation = await insert("private_conversations", {
        organization_id: org.id,
        webinar_id: webinar.id,
        participant_id: participant.id,
        status: "resolved",
        channel: "webinar_chat",
        created_at: iso(when),
        last_message_at: iso(new Date(when.getTime() + 90_000)),
        last_message_preview: answer,
        last_sender_kind: i % 2 ? "team" : "ai_agent",
      });
      await insert("private_messages", [
        { conversation_id: conversation.id, organization_id: org.id, participant_id: participant.id, sender_kind: "participant", body: question, created_at: iso(when) },
        { conversation_id: conversation.id, organization_id: org.id, participant_id: participant.id, sender_kind: i % 2 ? "team" : "ai_agent", body: answer, created_at: iso(new Date(when.getTime() + 90_000)) },
      ]);
    }
    created.push(webinar);
    say(`«${spec.title}»: ${spec.people} inscrições, ${cta.length} eventos de oferta, ${purchases.length} pagamentos, ${askers.length} conversas.`);
  }

  writeFileSync(
    new URL("../.scratch/capturas.json", import.meta.url),
    JSON.stringify({ ...JSON.parse(readFileSync(new URL("../.scratch/capturas.json", import.meta.url), "utf8")), organizationId: org.id, roomSlug: room.slug, webinarIds: created.map((w) => w.id), roomId: room.id }, null, 2),
  );
  say("Pronto. Entre com a utilizadora das capturas (ver .scratch/capturas.json) e as automações criam-se no editor («Usar modelo»).");
}

/* ---------- Limpar ---------- */

async function clean() {
  const org = await existing();
  if (org) {
    if (!org.is_test) throw new Error("Recusado: a conta com este nome não está marcada como teste.");
    await db(`organizations?id=eq.${org.id}&slug=eq.${SLUG}&is_test=eq.true`, { method: "DELETE" });
    say("Conta «Escola Vende+» apagada.");
  } else say("Não há conta das capturas.");
  const users = await api(`${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`);
  const user = (users?.users ?? []).find((u) => u.email === EMAIL);
  if (user) {
    // O espaço de trabalho que a aplicação cria sozinha na primeira entrada também sai.
    await db(`organizations?created_by=eq.${user.id}&slug=like.workspace-*`, { method: "DELETE" });
    await api(`${env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, { method: "DELETE" });
    say(`Utilizadora ${EMAIL} apagada.`);
  }
}

const commands = { criar: create, limpar: clean };
if (!commands[command]) {
  console.log("Uso: node scripts/cenario-capturas.mjs criar|limpar [--app URL]");
  process.exit(1);
}
await commands[command]().catch((error) => {
  console.error(`Erro: ${error.message}`);
  process.exit(1);
});
