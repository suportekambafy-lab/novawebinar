/**
 * Modo exemplo do Atendimento: quatro contactos fictícios para ver como fica.
 * Tudo vive neste ecrã, no browser: nada é lido nem gravado na base de dados,
 * e a faixa «Exemplo» por cima di-lo (no telemóvel, também ao lado do nome na conversa).
 */
import { Bot, Link2, PhoneCall, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  countTabs,
  inTab,
  matchesSearch,
  sortInbox,
  webinarFilters,
  type InboxItem,
  type InboxTab,
} from "@/lib/support/inbox";
import type { StaffStatus } from "@/lib/support/model";
import { TransferMenu, type TransferPerson } from "./case-tools";
import { ContactProfile, Section, type ProfileData } from "./contact-panel";
import {
  ConversationPane,
  type PaneAnalysis,
  type PaneMessage,
  type PaneNote,
} from "./conversation-view";
import {
  ExampleBanner,
  InboxFrame,
  InboxList,
  type InboxStep,
} from "./inbox";

/* ---------- Desenhos ---------- */

const svg = (body: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`)}`;

const HAIR = {
  short: "M19 27c0-11 6-16 13-16s13 5 13 16c-3-5-7-8-13-8s-10 3-13 8z",
  long: "M17 31c-1-13 5-20 15-20s16 7 15 20l1 13c-3 1-6-1-7-3V27c-3-4-6-5-9-5s-6 1-9 5v14c-1 2-4 4-7 3z",
  curly: "M18 27c-3-4 0-9 4-9 0-5 6-8 10-5 4-3 10 0 10 5 4 0 7 5 4 9-2-4-6-6-14-6s-12 2-14 6z",
  bald: "M21 22c2-6 6-9 11-9s9 3 11 9c-3-2-7-3-11-3s-8 1-11 3z",
};

/** Um retrato desenhado (sem fotografias de terceiros): fundo, pele, cabelo e camisola. */
function face(bg: string, skin: string, hair: string, style: keyof typeof HAIR, shirt: string) {
  return svg(
    `<rect width="64" height="64" fill="${bg}"/>` +
      `<path d="M8 66c2-15 12-21 24-21s22 6 24 21z" fill="${shirt}"/>` +
      `<rect x="27" y="35" width="10" height="11" rx="4" fill="${skin}"/>` +
      `<ellipse cx="32" cy="28" rx="12" ry="14" fill="${skin}"/>` +
      `<path d="${HAIR[style]}" fill="${hair}"/>` +
      `<circle cx="27.5" cy="29" r="1.3" fill="#2a1d17"/><circle cx="36.5" cy="29" r="1.3" fill="#2a1d17"/>` +
      `<path d="M28.5 35c2 1.6 5 1.6 7 0" stroke="#7a3e2c" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,
  );
}

/* ---------- Dados ---------- */

const ago = (now: number, minutes: number) => new Date(now - minutes * 60_000).toISOString();

const TEAMS = [
  { id: "vendas", name: "Vendas" },
  { id: "financeiro", name: "Financeiro" },
  { id: "suporte", name: "Suporte" },
];

const person = (
  id: string,
  name: string,
  team: string,
  presence: StaffStatus,
  openCases: number,
): TransferPerson => ({
  id,
  name,
  department_id: team,
  presence,
  openCases,
  capacity: 5,
  active: true,
  job_title: "",
});

const STAFF: TransferPerson[] = [
  person("sara", "Sara Lopes", "vendas", "available", 2),
  person("bruno", "Bruno Dias", "vendas", "online", 0),
  person("rui", "Rui Almeida", "financeiro", "available", 1),
  person("ines", "Inês Tavares", "suporte", "away", 0),
];

type Lead = {
  item: InboxItem;
  messages: PaneMessage[];
  notes: PaneNote[];
  analysis: PaneAnalysis | null;
  profile: ProfileData;
  automations: { name: string; status: string; variant: "success" | "warning" | "info" }[];
};

const OFFER = { title: "Fórmula Digital", button: "Quero garantir a minha vaga", href: null };

function buildLeads(now: number): Lead[] {
  const base = {
    priority: null,
    sla: "none" as const,
    ownerName: null,
    ownerId: null,
    teamName: null,
    example: true,
  };
  return [
    {
      item: {
        ...base,
        id: "ex-ana",
        name: "Ana Beatriz Costa",
        photo: face("#FFE9D6", "#8D5524", "#1F140F", "curly", "#E4572E"),
        channel: "webinar_chat",
        preview: "Posso pagar em 2 vezes por Multicaixa?",
        lastFrom: "contact",
        at: ago(now, 3),
        webinarId: "ex-fd",
        webinarTitle: "Fórmula Digital",
        state: "new",
        intent: "purchase",
        priority: "high",
        sla: "risk",
        hot: true,
        teamName: "Vendas",
      },
      messages: [
        {
          id: "a1",
          from: "contact",
          body: "Boa tarde! Quero entrar na Fórmula Digital. Ainda há vagas com o bónus?",
          at: ago(now, 9),
          second: 3120,
        },
        {
          id: "a2",
          from: "ai",
          body: "Há sim, Ana! As vagas com bónus fecham no fim da live. Pode garantir a sua aqui:",
          at: ago(now, 8),
          offer: OFFER,
        },
        {
          id: "a3",
          from: "contact",
          body: "Posso pagar em 2 vezes por Multicaixa?",
          at: ago(now, 3),
          second: 3480,
        },
      ],
      notes: [
        {
          id: "an1",
          at: ago(now, 2),
          title: "Passado a Vendas pelo agente",
          by: "agent",
          detail: "Pagamento em prestações. Sugestão: confirmar as condições e enviar o link.",
        },
      ],
      analysis: {
        facts: [
          { label: "Intenção", value: "Compra" },
          { label: "Categoria", value: "Pagamento" },
          { label: "Confiança", value: "92%" },
          { label: "Precisa de uma pessoa", value: "Sim: prestações" },
          { label: "Acção sugerida", value: "Confirmar as condições e enviar o link" },
        ],
        suggestion: {
          text: "Pode sim, Ana: em 2 prestações por Multicaixa Express. Envio-lhe já o link com as duas prestações?",
        },
      },
      profile: {
        name: "Ana Beatriz Costa",
        badges: [
          { label: "Ainda não comprou", variant: "secondary" },
          { label: "Alta intenção", variant: "soft" },
          { label: "Quente", variant: "destructive" },
        ],
        email: "ana.costa@exemplo.ao",
        phone: "+244923456781",
        place: "Luanda, Angola",
        device: "Telemóvel",
        enrolled: "Inscrita em Fórmula Digital · hoje",
        qualification: [
          { label: "Tema", value: "Compra" },
          { label: "Etapa", value: "Clicaram" },
          { label: "Temperatura", value: "Quente" },
          { label: "Próxima acção", value: "Confirmar as prestações e enviar o link" },
        ],
        stats: [
          { label: "Compras", value: "0" },
          { label: "Valor investido", value: "—" },
          { label: "Webinars assistidos", value: "2 de 2" },
          { label: "Mensagens no chat", value: "2" },
        ],
        purchases: [],
        totalPaid: null,
        webinars: [
          {
            id: "w1",
            title: "Fórmula Digital",
            at: ago(now, 55),
            pct: 78,
            label: "Presente",
            variant: "info",
            flags: ["Viu a oferta", "Clicou na oferta", "2 mensagens"],
          },
          {
            id: "w2",
            title: "Tráfego Físico (edição de Setembro)",
            at: ago(now, 60 * 24 * 21),
            pct: 100,
            label: "Assistiu",
            variant: "success",
            flags: ["Viu a oferta"],
          },
        ],
        origin: {
          first: "Instagram · fd-outubro",
          visits: [
            {
              id: "o1",
              at: ago(now, 60 * 24 * 6),
              webinar: "Fórmula Digital",
              via: "Página do webinar",
              detail: "Instagram · fd-outubro · instagram.com",
            },
          ],
        },
        activity: [
          { id: "x1", at: ago(now, 2), label: "Passado a Vendas", who: "Agente IA" },
          {
            id: "x2",
            at: ago(now, 3),
            label: "Mensagem recebida",
            detail: "Posso pagar em 2 vezes por Multicaixa?",
          },
          { id: "x3", at: ago(now, 6), label: "Clicou na oferta", detail: "Fórmula Digital" },
          { id: "x4", at: ago(now, 8), label: "Link da oferta enviado", who: "Agente IA" },
          { id: "x5", at: ago(now, 55), label: "Entrou na sala", detail: "Fórmula Digital" },
        ],
        conversations: [
          {
            id: "ex-ana",
            at: ago(now, 3),
            title: "Fórmula Digital",
            preview: "Posso pagar em 2 vezes por Multicaixa?",
            cases: <Badge variant="warning">Caso 221 · À espera</Badge>,
          },
          {
            id: "ex-ana-set",
            at: ago(now, 60 * 24 * 21),
            title: "Tráfego Físico (edição de Setembro)",
            preview: "A que horas começa a live?",
          },
        ],
        lists: ["Lançamento Outubro", "Clicou na oferta"],
      },
      automations: [
        { name: "Lembretes da live", status: "Concluída", variant: "success" },
        { name: "Quem clicou e não comprou", status: "Aguardando", variant: "warning" },
      ],
    },
    {
      item: {
        ...base,
        id: "ex-joao",
        name: "João Manuel",
        photo: face("#DDEBFF", "#5C3A21", "#111111", "short", "#2F5D9E"),
        channel: "whatsapp",
        preview: "Obrigado, já paguei pela referência.",
        lastFrom: "contact",
        at: ago(now, 6),
        webinarId: "ex-fd",
        webinarTitle: "Fórmula Digital",
        state: "attending",
        intent: "payment",
        priority: "high",
        sla: "ok",
        hot: true,
        teamName: "Financeiro",
        ownerName: "Rui Almeida",
        ownerId: "rui",
      },
      messages: [
        {
          id: "j1",
          from: "contact",
          body: "O pagamento por cartão foi recusado duas vezes.",
          at: ago(now, 31),
        },
        {
          id: "j2",
          from: "ai",
          body: "Lamento, João. Vou chamar alguém da equipa para confirmar isso para si. Quem continua: Rui, da equipa Financeiro.",
          at: ago(now, 30),
        },
        {
          id: "j3",
          from: "team",
          author: "Rui Almeida",
          body: "Olá João! Envio-lhe uma referência Multicaixa: entidade 11223, referência 998 877 665.",
          at: ago(now, 18),
        },
        {
          id: "j4",
          from: "contact",
          body: "Obrigado, já paguei pela referência.",
          at: ago(now, 6),
        },
      ],
      notes: [
        {
          id: "jn1",
          at: ago(now, 30),
          title: "Passado a Financeiro pelo agente",
          by: "agent",
          detail: "Pagamento recusado no cartão. Sugestão: enviar outra forma de pagamento.",
        },
      ],
      analysis: null,
      profile: {
        name: "João Manuel",
        badges: [
          { label: "Cliente recorrente · 2 compras", variant: "success" },
          { label: "Alta intenção", variant: "soft" },
        ],
        email: "joao.manuel@exemplo.ao",
        phone: "+244912345670",
        place: "Benguela, Angola",
        device: "Telemóvel",
        enrolled: "Inscrito em Fórmula Digital · hoje",
        qualification: [
          { label: "Tema", value: "Pagamento" },
          { label: "Etapa", value: "Iniciaram o pagamento" },
          { label: "Temperatura", value: "Quente" },
          { label: "Próxima acção", value: "Confirmar o pagamento e libertar o acesso" },
        ],
        stats: [
          { label: "Compras", value: "2" },
          { label: "Valor investido", value: "122 000 Kz" },
          { label: "Webinars assistidos", value: "4 de 4" },
          { label: "Mensagens no chat", value: "7" },
        ],
        purchases: [
          {
            id: "p0",
            title: "Fórmula Digital",
            amount: "147 000 Kz",
            status: "Falhou",
            variant: "destructive",
            at: ago(now, 32),
          },
          {
            id: "p1",
            title: "Mentoria Acelera",
            amount: "97 000 Kz",
            status: "Pago",
            variant: "success",
            at: ago(now, 60 * 24 * 40),
          },
          {
            id: "p2",
            title: "Curso Excel Pro",
            amount: "25 000 Kz",
            status: "Pago",
            variant: "success",
            at: ago(now, 60 * 24 * 95),
          },
        ],
        totalPaid: "122 000 Kz",
        webinars: [
          {
            id: "w1",
            title: "Fórmula Digital",
            at: ago(now, 70),
            pct: 100,
            label: "Assistiu",
            variant: "success",
            flags: ["Viu a oferta", "Clicou na oferta"],
          },
          {
            id: "w2",
            title: "Mentoria Acelera",
            at: ago(now, 60 * 24 * 41),
            pct: 100,
            label: "Comprou",
            variant: "success",
            flags: ["Viu a oferta", "Clicou na oferta"],
          },
          {
            id: "w3",
            title: "Excel em 1 hora",
            at: ago(now, 60 * 24 * 96),
            pct: 92,
            label: "Comprou",
            variant: "success",
            flags: [],
          },
          {
            id: "w4",
            title: "Tráfego Físico (edição de Julho)",
            at: ago(now, 60 * 24 * 80),
            pct: 64,
            label: "Presente",
            variant: "info",
            flags: [],
          },
        ],
        origin: {
          first: "Facebook · remarketing",
          visits: [
            {
              id: "o1",
              at: ago(now, 60 * 24 * 3),
              webinar: "Fórmula Digital",
              via: "Página do webinar",
              detail: "WhatsApp · grupo de clientes",
            },
          ],
        },
        activity: [
          {
            id: "y1",
            at: ago(now, 6),
            label: "Mensagem recebida",
            detail: "Obrigado, já paguei pela referência.",
          },
          { id: "y2", at: ago(now, 18), label: "Resposta da equipa", who: "Rui Almeida" },
          { id: "y3", at: ago(now, 30), label: "Passado a Financeiro", who: "Agente IA" },
          {
            id: "y4",
            at: ago(now, 32),
            label: "Pagamento falhou",
            detail: "Fórmula Digital · 147 000 Kz",
          },
          { id: "y5", at: ago(now, 34), label: "Iniciou o pagamento", detail: "Fórmula Digital" },
        ],
        conversations: [
          {
            id: "ex-joao",
            at: ago(now, 6),
            title: "Fórmula Digital",
            preview: "Obrigado, já paguei pela referência.",
            cases: <Badge variant="info">Caso 214 · Pagamento · Em atendimento</Badge>,
          },
          {
            id: "ex-joao-ma",
            at: ago(now, 60 * 24 * 40),
            title: "Mentoria Acelera",
            preview: "Já consigo entrar, obrigado!",
            cases: <Badge variant="outline">Caso 131 · Acesso · Resolvido</Badge>,
          },
        ],
        lists: ["Clientes", "Mentoria Acelera"],
      },
      automations: [
        { name: "Pagamento recusado", status: "Em execução", variant: "info" },
        { name: "Boas-vindas aos clientes", status: "Concluída", variant: "success" },
      ],
    },
    {
      item: {
        ...base,
        id: "ex-marta",
        name: "Marta Silva",
        photo: face("#F1E8FF", "#E8B48F", "#7A3B1E", "long", "#7B4FD6"),
        channel: "instagram",
        preview: "O acesso às aulas é de 12 meses, e pode rever o replay quantas vezes quiser.",
        lastFrom: "ai",
        at: ago(now, 14),
        webinarId: "ex-tf",
        webinarTitle: "Tráfego Físico",
        state: "ai",
        intent: "offer_question",
        hot: false,
      },
      messages: [
        {
          id: "m1",
          from: "contact",
          body: "Olá! Quanto tempo tenho acesso às aulas depois de comprar?",
          at: ago(now, 15),
        },
        {
          id: "m2",
          from: "ai",
          body: "Olá Marta! O acesso às aulas é de 12 meses, e pode rever o replay quantas vezes quiser.",
          at: ago(now, 14),
        },
      ],
      notes: [],
      analysis: {
        facts: [
          { label: "Intenção", value: "Pergunta" },
          { label: "Confiança", value: "96%" },
          { label: "Decisão", value: "Responder" },
          { label: "Precisa de uma pessoa", value: "Não" },
        ],
        suggestion: null,
      },
      profile: {
        name: "Marta Silva",
        badges: [
          { label: "Ainda não comprou", variant: "secondary" },
          { label: "Morno", variant: "warning" },
        ],
        email: "marta.silva@exemplo.pt",
        phone: null,
        place: "Lisboa, Portugal",
        device: "Computador",
        enrolled: "Inscrita em Tráfego Físico · ontem",
        qualification: [
          { label: "Tema", value: "Dúvida sobre a oferta" },
          { label: "Etapa", value: "Sem eventos" },
          { label: "Temperatura", value: "Morno" },
          { label: "Próxima acção", value: "Lembrar a live de quinta às 20:00" },
        ],
        stats: [
          { label: "Compras", value: "0" },
          { label: "Valor investido", value: "—" },
          { label: "Webinars assistidos", value: "0 de 1" },
          { label: "Mensagens no chat", value: "1" },
        ],
        purchases: [],
        totalPaid: null,
        webinars: [
          {
            id: "w1",
            title: "Tráfego Físico",
            at: ago(now, 60 * 20),
            pct: 0,
            label: "Inscrito",
            variant: "outline",
            flags: [],
          },
        ],
        origin: {
          first: "Instagram · anúncio stories",
          visits: [
            {
              id: "o1",
              at: ago(now, 60 * 20),
              webinar: "Tráfego Físico",
              via: "Formulário noutro site",
              detail: "Meta Ads · tf-stories · marta-blog.pt",
            },
          ],
        },
        activity: [
          { id: "z1", at: ago(now, 14), label: "O agente respondeu sozinho", who: "Agente IA" },
          {
            id: "z2",
            at: ago(now, 15),
            label: "Mensagem recebida",
            detail: "Quanto tempo tenho acesso às aulas?",
          },
          { id: "z3", at: ago(now, 60 * 20), label: "Inscreveu-se", detail: "Tráfego Físico" },
        ],
        conversations: [
          {
            id: "ex-marta",
            at: ago(now, 14),
            title: "Tráfego Físico",
            preview: "O acesso às aulas é de 12 meses, e pode rever o replay quantas vezes quiser.",
          },
        ],
        lists: [],
      },
      automations: [{ name: "Lembretes antes da live", status: "Em execução", variant: "info" }],
    },
    {
      item: {
        ...base,
        id: "ex-carlos",
        name: "Carlos Neto",
        photo: face("#E3F6EC", "#A8693F", "#3B2A20", "bald", "#2E8B57"),
        channel: "email",
        preview: "Paguei ontem e ainda não recebi o acesso à área de membros.",
        lastFrom: "contact",
        at: ago(now, 52),
        webinarId: "ex-ma",
        webinarTitle: "Mentoria Acelera",
        state: "new",
        intent: "post_purchase",
        hot: false,
        priority: "normal",
        sla: "breached",
        teamName: "Suporte",
      },
      messages: [
        {
          id: "c1",
          from: "contact",
          body: "Paguei ontem e ainda não recebi o acesso à área de membros.",
          at: ago(now, 52),
        },
      ],
      notes: [
        {
          id: "cn1",
          at: ago(now, 51),
          title: "Passado a Suporte pelo agente",
          by: "agent",
          detail: "Pós-compra sem acesso. Sugestão: confirmar o pagamento e libertar o acesso.",
        },
      ],
      analysis: {
        facts: [
          { label: "Intenção", value: "Pós-compra" },
          { label: "Categoria", value: "Acesso" },
          { label: "Confiança", value: "88%" },
          { label: "Precisa de uma pessoa", value: "Sim: acesso" },
          { label: "Acção sugerida", value: "Confirmar o pagamento e libertar o acesso" },
        ],
        suggestion: {
          text: "Olá Carlos, já confirmei o seu pagamento. Envio-lhe agora o acesso para o e-mail carlos.neto@exemplo.ao.",
        },
      },
      profile: {
        name: "Carlos Neto",
        badges: [{ label: "Cliente · 1 compra", variant: "success" }],
        email: "carlos.neto@exemplo.ao",
        phone: "+244934567812",
        place: "Huambo, Angola",
        device: "Computador",
        enrolled: "Inscrito em Mentoria Acelera · há 3 dias",
        qualification: [
          { label: "Tema", value: "Pós-compra" },
          { label: "Etapa", value: "Compraram" },
          { label: "Temperatura", value: "Cliente" },
          { label: "Próxima acção", value: "Libertar o acesso hoje" },
        ],
        stats: [
          { label: "Compras", value: "1" },
          { label: "Valor investido", value: "97 000 Kz" },
          { label: "Webinars assistidos", value: "1 de 1" },
          { label: "Mensagens no chat", value: "0" },
        ],
        purchases: [
          {
            id: "p1",
            title: "Mentoria Acelera",
            amount: "97 000 Kz",
            status: "Pago",
            variant: "success",
            at: ago(now, 60 * 22),
          },
        ],
        totalPaid: "97 000 Kz",
        webinars: [
          {
            id: "w1",
            title: "Mentoria Acelera",
            at: ago(now, 60 * 24 * 3),
            pct: 100,
            label: "Comprou",
            variant: "success",
            flags: ["Viu a oferta", "Clicou na oferta"],
          },
        ],
        origin: {
          first: "Google · pesquisa",
          visits: [
            {
              id: "o1",
              at: ago(now, 60 * 24 * 3),
              webinar: "Mentoria Acelera",
              via: "Página do webinar",
              detail: "Google Ads · mentoria-pesquisa",
            },
          ],
        },
        activity: [
          { id: "k1", at: ago(now, 51), label: "Passado a Suporte", who: "Agente IA" },
          {
            id: "k2",
            at: ago(now, 52),
            label: "E-mail recebido",
            detail: "Paguei ontem e ainda não recebi o acesso.",
          },
          {
            id: "k3",
            at: ago(now, 60 * 22),
            label: "Pagamento confirmado",
            detail: "Mentoria Acelera · 97 000 Kz",
          },
        ],
        conversations: [
          {
            id: "ex-carlos",
            at: ago(now, 52),
            title: "Mentoria Acelera",
            preview: "Paguei ontem e ainda não recebi o acesso à área de membros.",
            cases: <Badge variant="destructive">Caso 219 · Prazo ultrapassado</Badge>,
          },
        ],
        lists: ["Clientes"],
      },
      automations: [{ name: "Boas-vindas aos clientes", status: "Aguardando", variant: "warning" }],
    },
  ];
}

export const EXAMPLE_AGENT = { active: true, resolved: 18, escalated: 4 };

/* ---------- Ecrã ---------- */

export function ExampleInbox({
  onExit,
  initialStep = "list",
  initialId = null,
}: {
  onExit: () => void;
  initialStep?: InboxStep;
  initialId?: string | null;
}) {
  const [now] = useState(() => Date.now());
  const [leads, setLeads] = useState(() => buildLeads(now));
  const [tab, setTab] = useState<InboxTab>("all");
  const [search, setSearch] = useState("");
  const [webinarId, setWebinarId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(initialId);
  const [step, setStep] = useState<InboxStep>(initialStep);

  const items = leads.map((l) => l.item);
  const scoped = items.filter((i) => !webinarId || i.webinarId === webinarId);
  const visible = useMemo(
    () => sortInbox(scoped.filter((i) => inTab(i, tab) && matchesSearch(i, search))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, tab, search, webinarId],
  );
  const lead =
    leads.find((l) => l.item.id === activeId) ??
    leads.find((l) => l.item.id === visible[0]?.id) ??
    null;
  const update = (id: string, change: (l: Lead) => Lead) =>
    setLeads((all) => all.map((l) => (l.item.id === id ? change(l) : l)));
  const pretend = (what: string) => toast(`Exemplo: ${what}. Nada foi enviado.`);

  const conversation = lead ? (
    <ExampleConversation
      lead={lead}
      onAssume={() =>
        update(lead.item.id, (l) => ({
          ...l,
          item: { ...l.item, state: "attending", ownerName: "Você", ownerId: "me" },
        }))
      }
      onSend={(body) =>
        update(lead.item.id, (l) => ({
          ...l,
          item: {
            ...l.item,
            lastFrom: "team",
            preview: body,
            at: new Date().toISOString(),
            state: "attending",
            ownerName: l.item.ownerName ?? "Você",
          },
          messages: [
            ...l.messages,
            {
              id: `me-${Date.now()}`,
              from: "team",
              author: "Você",
              body,
              at: new Date().toISOString(),
            },
          ],
        }))
      }
      pretend={pretend}
      onBack={() => setStep("list")}
      onShowContact={() => setStep("contact")}
    />
  ) : null;

  return (
    <InboxFrame
      step={step}
      banner={<ExampleBanner onExit={onExit} />}
      list={
        <InboxList
          items={visible}
          activeId={lead?.item.id ?? null}
          tab={tab}
          counts={countTabs(scoped)}
          onTab={setTab}
          search={search}
          onSearch={setSearch}
          webinars={webinarFilters(items)}
          webinarId={webinarId}
          onWebinar={setWebinarId}
          onSelect={(id) => {
            setActiveId(id);
            setStep("chat");
          }}
        />
      }
      conversation={conversation}
      contact={
        lead ? (
          <ContactProfile
            key={lead.item.id}
            data={{ ...lead.profile, photo: lead.item.photo, channel: lead.item.channel }}
            currentConversationId={lead.item.id}
            onOpenConversation={(id) => {
              if (!leads.some((l) => l.item.id === id)) {
                pretend("abriria esta conversa antiga");
                return;
              }
              setActiveId(id);
              setStep("chat");
            }}
            automations={
              <Section title="Automações">
                <ul className="space-y-2">
                  {lead.automations.map((a) => (
                    <li
                      key={a.name}
                      className="flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm"
                    >
                      <span className="truncate font-medium">{a.name}</span>
                      <Badge variant={a.variant}>{a.status}</Badge>
                    </li>
                  ))}
                </ul>
              </Section>
            }
            manage={
              <button
                type="button"
                onClick={() => pretend("as etiquetas geram-se nos Contactos")}
                className="text-[13px] font-medium hover:underline"
              >
                Gerir
              </button>
            }
            onBack={() => setStep("chat")}
          />
        ) : null
      }
    />
  );
}

function ExampleConversation({
  lead,
  onAssume,
  onSend,
  pretend,
  onBack,
  onShowContact,
}: {
  lead: Lead;
  onAssume: () => void;
  onSend: (body: string) => void;
  pretend: (what: string) => void;
  onBack: () => void;
  onShowContact: () => void;
}) {
  const { item } = lead;
  return (
    <ConversationPane
      key={item.id}
      name={item.name}
      photo={item.photo}
      channel={item.channel}
      example
      contactLine={[item.webinarTitle ?? "", lead.profile.place ?? ""].filter(Boolean)}
      status={
        item.state === "ai"
          ? { tone: "ai", text: "O agente está a responder. Assuma para falar você." }
          : item.state === "new"
            ? { tone: "wait", text: `À espera de uma pessoa · ${item.teamName ?? "equipa"}` }
            : { tone: "person", text: `Com ${item.ownerName ?? "a equipa"}` }
      }
      actions={
        <>
          {item.ownerId !== "me" && (
            <Button onClick={onAssume}>
              <UserCheck /> Assumir
            </Button>
          )}
          <TransferMenu
            c={{ assigned_staff_id: item.ownerId }}
            staff={STAFF}
            departments={TEAMS}
            size="default"
            onTransfer={(target) =>
              pretend(
                `passaria a ${STAFF.find((s) => s.id === target.staffId)?.name ?? TEAMS.find((t) => t.id === target.departmentId)?.name}`,
              )
            }
            onEscalate={() => pretend("passaria ao supervisor")}
            onReturnToAi={item.state !== "ai" ? () => pretend("voltaria ao Agente IA") : undefined}
          />
        </>
      }
      messages={lead.messages}
      notes={lead.notes}
      analysis={lead.analysis}
      quick={[
        { label: "Link da oferta", insert: "https://pay.exemplo.ao/formula-digital" },
        {
          label: "Link da sala",
          icon: Link2,
          insert: "https://novawebinar.app/w/formula-digital",
        },
        {
          label: "Marcar ligação",
          icon: PhoneCall,
          onClick: () => pretend("marcaria uma ligação"),
        },
        { label: "Devolver ao agente", icon: Bot, onClick: () => pretend("voltaria ao Agente IA") },
      ]}
      noteEnabled
      replyHint="Escreva a resposta"
      onSend={async ({ mode, body }) => {
        if (mode === "note") {
          pretend("a nota ficaria só para a equipa");
          return true;
        }
        onSend(body);
        return true;
      }}
      onSendSuggestion={
        lead.analysis?.suggestion ? () => onSend(lead.analysis!.suggestion!.text) : undefined
      }
      onDiscardSuggestion={
        lead.analysis?.suggestion ? () => pretend("a sugestão seria descartada") : undefined
      }
      onBack={onBack}
      onShowContact={onShowContact}
    />
  );
}
