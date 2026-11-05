/**
 * Os tutoriais animados da aplicação: cada passo é uma captura real do produto (landing/shots.tsx, com
 * a conta fictícia) com a câmara, o cursor, o clique e, às vezes, um campo a preencher-se. As
 * coordenadas são as de uma cópia da captura com 900 px de largura (900×562,5).
 */
import analises from "@/assets/landing/analises.webp";
import atendimento from "@/assets/landing/atendimento.webp";
import editorAgenda from "@/assets/landing/editor-agenda.webp";
import editorChat from "@/assets/landing/editor-chat.webp";
import editorOferta from "@/assets/landing/editor-oferta.webp";
import fluxo from "@/assets/landing/fluxo.webp";
import painel from "@/assets/landing/painel.webp";
import type { TutorialId } from "@/components/tutorial/tutorial-routes";

type Box = [x: number, y: number, w: number, h: number];

export type TutorialStep = {
  shot: string;
  /** O título animado; a palavra-chave entre asteriscos fica na cor da marca. */
  title: string;
  text: string;
  /** A câmara aproxima-se deste ponto (0–1 da captura) com este zoom. */
  zoom?: { s: number; x: number; y: number };
  /** O cursor passa por estes pontos e clica no último. */
  cursor?: [number, number][];
  ring?: Box;
  typing?: { box: Box; text: string };
};

export type Tutorial = { title: string; steps: TutorialStep[] };

export const TUTORIALS: Record<TutorialId, Tutorial> = {
  "criar-webinar": {
    title: "Criar um webinar",
    steps: [
      {
        shot: painel,
        title: "Começa em *Novo webinar.*",
        text: "No Painel ou em Webinars, carrega em «Novo webinar». O editor leva-te etapa a etapa pela barra de cima, de Início a Revisão.",
        zoom: { s: 1.7, x: 0.93, y: 0.06 },
        cursor: [[620, 300], [834, 34]],
        ring: [788, 23, 92, 22],
      },
      {
        shot: editorChat,
        title: "O chat *ganha vida.*",
        text: "Em Chat escolhes o país, o volume e o tom das mensagens simuladas. A pré-visualização ao lado mostra a sala como quem assiste a vê.",
        zoom: { s: 1.55, x: 0.08, y: 0.3 },
        cursor: [[420, 320], [193, 195]],
        ring: [154, 177, 81, 40],
      },
      {
        shot: editorOferta,
        title: "A oferta entra *no minuto certo.*",
        text: "Em Oferta defines o produto, o preço e o link de pagamento. O cartão aparece na sala no segundo que escolheres, como na pré-visualização.",
        zoom: { s: 1.45, x: 0.12, y: 0.5 },
        cursor: [[420, 200], [150, 272]],
        ring: [67, 262, 168, 22],
        typing: { box: [70, 265, 160, 16], text: "Turma Vende+" },
      },
      {
        shot: editorAgenda,
        title: "Escolhe *quando acontece.*",
        text: "Em Agenda: uma data, repetir, just in time (à hora de cada pessoa) ou sempre disponível. A sala de espera mostra a contagem até começar.",
        zoom: { s: 1.6, x: 0.08, y: 0.35 },
        cursor: [[420, 300], [103, 116]],
        ring: [58, 93, 91, 46],
        typing: { box: [60, 284, 80, 18], text: "15/10/2026" },
      },
      {
        shot: editorAgenda,
        title: "*Publica* e partilha o link.",
        text: "«Publicar» passa pela Revisão, que confirma que nada falta. O olho ao lado abre a sala de teste, que não conta nas métricas.",
        zoom: { s: 2, x: 0.18, y: 0.02 },
        cursor: [[320, 160], [227, 15]],
        ring: [204, 5, 47, 20],
      },
    ],
  },
  atendimento: {
    title: "Atendimento",
    steps: [
      {
        shot: atendimento,
        title: "Todas as conversas *num só sítio.*",
        text: "As mensagens privadas da sala chegam aqui, com separadores para novas, IA e em atendimento. O ponto verde diz quem ainda está na sala.",
        zoom: { s: 1.45, x: 0.3, y: 0.3 },
        cursor: [[600, 300], [280, 212]],
        ring: [183, 192, 200, 40],
      },
      {
        shot: atendimento,
        title: "O Agente IA *sugere a resposta.*",
        text: "O Agente responde com base no conteúdo do webinar. Quando o caso pede uma pessoa, passa a conversa à equipa e diz porquê.",
        zoom: { s: 1.7, x: 0.75, y: 0.74 },
        cursor: [[600, 300], [840, 423]],
        ring: [398, 388, 478, 48],
      },
      {
        shot: atendimento,
        title: "*Assume* ou transfere.",
        text: "«Assumir» passa a conversa para ti; «Transferir» envia-a a outra pessoa ou departamento. Todos veem quem está a tratar de quê.",
        zoom: { s: 1.8, x: 0.88, y: 0.18 },
        cursor: [[600, 260], [757, 115]],
        ring: [727, 105, 62, 22],
      },
      {
        shot: atendimento,
        title: "Ajuda a *fechar a venda.*",
        text: "Responde, deixa uma nota interna ou envia o link da oferta ou da sala com um clique, sem sair da conversa.",
        zoom: { s: 1.6, x: 0.55, y: 0.9 },
        cursor: [[650, 330], [436, 483]],
        ring: [396, 474, 80, 20],
        typing: { box: [425, 503, 330, 18], text: "Claro! Aqui tens o link da oferta 👇" },
      },
    ],
  },
  automacoes: {
    title: "Automações",
    steps: [
      {
        shot: fluxo,
        title: "Cada lançamento *tem o seu fluxo.*",
        text: "O fluxo começa na página de inscrição e segue pelos grupos de WhatsApp, lembretes e mensagens. Tudo num só desenho.",
        zoom: { s: 1.5, x: 0.55, y: 0.45 },
        cursor: [[700, 420], [457, 245]],
        ring: [402, 196, 111, 102],
      },
      {
        shot: fluxo,
        title: "Junta *peças* ao fluxo.",
        text: "Em «Peças do fluxo» tens gatilhos, grupos, mensagens de aquecimento e de recuperação, condições e esperas. Abre uma secção e junta ao desenho.",
        zoom: { s: 1.6, x: 0.2, y: 0.55 },
        cursor: [[560, 420], [232, 338]],
        ring: [194, 326, 186, 24],
      },
      {
        shot: fluxo,
        title: "Lembretes *no momento certo.*",
        text: "Cada mensagem tem o seu momento: dias antes da sessão, à hora, ou para quem faltou. A compra aprovada pára as mensagens de venda.",
        zoom: { s: 1.7, x: 0.86, y: 0.9 },
        cursor: [[560, 420], [790, 507]],
        ring: [727, 477, 131, 50],
      },
    ],
  },
  analises: {
    title: "Análises",
    steps: [
      {
        shot: analises,
        title: "Os números *de todos os webinars.*",
        text: "Escolhe o período e o webinar no topo. Os cartões mostram inscritos, presença, conversão no CTA e facturação.",
        zoom: { s: 1.5, x: 0.25, y: 0.15 },
        cursor: [[600, 300], [238, 91]],
        ring: [183, 81, 112, 22],
      },
      {
        shot: analises,
        title: "Quem *comprou* e quanto.",
        text: "Compraram e Facturação contam os pagamentos aprovados no período, os mesmos em todas as páginas.",
        zoom: { s: 1.45, x: 0.72, y: 0.47 },
        cursor: [[500, 160], [530, 268]],
        ring: [418, 216, 461, 96],
      },
      {
        shot: analises,
        title: "Onde as pessoas *ficam pelo caminho.*",
        text: "O funil mostra cada passo, da inscrição à compra, e quantos passaram de um para o seguinte.",
        zoom: { s: 1.2, x: 0.55, y: 0.85 },
        cursor: [[450, 300], [546, 444]],
        ring: [196, 374, 690, 172],
      },
    ],
  },
};
