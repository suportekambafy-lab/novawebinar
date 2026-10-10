export type FeatureVisual = "schedule" | "room" | "offer" | "sales" | "replay" | "assistance" | "dashboard";

export type FeatureSection = {
  title: string;
  body: string;
  points?: string[];
  visual?: FeatureVisual;
  visualCaption?: string;
};

export type FeatureDefinition = {
  slug: string;
  menuTitle: string;
  menuCopy: string;
  eyebrow: string;
  title: string;
  intro: string;
  heroVisual: FeatureVisual;
  heroCaption: string;
  highlights: string[];
  sections: FeatureSection[];
  metaTitle: string;
  metaDescription: string;
};

export const landingFeatures: FeatureDefinition[] = [
  {
    slug: "sessoes",
    menuTitle: "Sessões e agenda",
    menuCopy: "Sessão única, repetição diária ou semanal e just in time.",
    eyebrow: "01 · SESSÕES",
    title: "Grave uma vez e defina quando volta a acontecer.",
    intro:
      "O Novawebinar apresenta um vídeo pré-gravado numa experiência de sessão organizada. Define a data, a repetição e a duração, e cada sessão abre sozinha na hora marcada.",
    heroVisual: "schedule",
    heroCaption: "Configuração da sessão no editor de webinares.",
    highlights: [
      "Sessão única numa data e hora concretas",
      "Repetição automática diária ou semanal",
      "Modo just in time com entradas frequentes",
      "Replay disponível quando o ativa",
    ],
    sections: [
      {
        title: "Três formas de abrir a sala",
        body:
          "Escolha o formato consoante o objetivo: uma sessão pontual para um lançamento, repetição para manter uma agenda constante, ou just in time para quem chega a qualquer hora entrar numa sessão que começa em poucos minutos.",
        points: [
          "Único: uma data, uma hora, uma sala",
          "Recorrente: a mesma sessão todos os dias ou todas as semanas",
          "Just in time: próximas entradas calculadas automaticamente",
        ],
      },
      {
        title: "A sala abre preparada",
        body:
          "Antes do início, quem chega vê a contagem decrescente com o modelo visual que escolher. À hora marcada, o vídeo arranca sincronizado para todos e o chat programado começa a acompanhar o conteúdo.",
        visual: "room",
        visualCaption: "Sala de sessão — demonstração.",
      },
      {
        title: "Fuso horário e duração",
        body:
          "Define a hora de início, a hora de fim e o fuso horário da sessão. A agenda mostra as próximas datas e o calendário reúne todas as sessões previstas.",
      },
    ],
    metaTitle: "Sessões e agenda — Novawebinar",
    metaDescription:
      "Sessão única, repetição diária ou semanal e modo just in time: agende o seu webinar automatizado e deixe a sala abrir sozinha.",
  },
  {
    slug: "chat",
    menuTitle: "Chat programado",
    menuCopy: "Mensagens ligadas ao minuto exato do vídeo.",
    eyebrow: "02 · CHAT",
    title: "A conversa acompanha o conteúdo, minuto a minuto.",
    intro:
      "Prepare mensagens, perguntas e respostas para momentos concretos do vídeo. Durante a sessão entram no instante definido, junto com as mensagens reais de quem está na sala.",
    heroVisual: "room",
    heroCaption: "Sala com chat em curso — demonstração.",
    highlights: [
      "Mensagens ligadas ao tempo da gravação",
      "Mensagens reais dos participantes no mesmo fluxo",
      "Reações associadas a momentos do conteúdo",
      "Moderação e histórico por sessão",
    ],
    sections: [
      {
        title: "Preparado antes, natural durante",
        body:
          "Escreve a conversa no editor, indicando o momento do vídeo em que cada mensagem aparece. A sala reproduz essa sequência em todas as sessões, mantendo o ritmo da apresentação.",
      },
      {
        title: "Quem está na sala participa a sério",
        body:
          "As mensagens escritas pelos participantes entram no mesmo chat e ficam guardadas na sessão. A equipa responde a partir do painel e acompanha tudo em tempo real.",
        visual: "assistance",
        visualCaption: "Conversa privada de suporte — demonstração.",
      },
      {
        title: "Audiência simulada, apenas como demonstração",
        body:
          "Existe um modo de demonstração com participantes simulados, usado para ensaiar a sessão. É identificado como demonstração no painel e mantido separado dos dados reais.",
      },
    ],
    metaTitle: "Chat programado — Novawebinar",
    metaDescription:
      "Prepare mensagens ligadas ao minuto do vídeo e junte-as às mensagens reais dos participantes durante a sessão.",
  },
  {
    slug: "oferta",
    menuTitle: "Oferta na sala",
    menuCopy: "Produto, preço e contagem no momento definido.",
    eyebrow: "03 · OFERTA",
    title: "A oferta aparece no momento certo da apresentação.",
    intro:
      "Configure o produto, o preço, o botão e o tempo de duração. Quando o vídeo chega ao ponto definido, o painel da oferta abre na sala com a contagem a correr.",
    heroVisual: "offer",
    heroCaption: "Painel da oferta na sala — demonstração.",
    highlights: [
      "Produto, preço anterior e preço atual",
      "Botão de compra com o texto que definir",
      "Contagem visível durante a janela da oferta",
      "Cliques na oferta registados por sessão",
    ],
    sections: [
      {
        title: "Programada ao segundo",
        body:
          "Indica o momento do vídeo em que a oferta abre e quanto tempo permanece disponível. A contagem continua a correr para quem está na sala, mesmo depois do fim da apresentação.",
      },
      {
        title: "Visível sem interromper",
        body:
          "A oferta ocupa o separador próprio ao lado do chat e do suporte, por isso quem quiser continuar a acompanhar o vídeo não perde nada.",
        visual: "offer",
        visualCaption: "Separador da oferta — demonstração.",
      },
      {
        title: "Medida no fim",
        body:
          "A análise mostra quantas pessoas chegaram ao momento da oferta, quantas a viram e quantas clicaram, para comparar sessões entre si.",
      },
    ],
    metaTitle: "Oferta na sala — Novawebinar",
    metaDescription:
      "Configure produto, preço, botão e contagem: a oferta abre no momento definido do vídeo e fica registada na análise.",
  },
  {
    slug: "vendas",
    menuTitle: "Notificações de venda",
    menuCopy: "Avisos de compra no vídeo e no chat da sessão.",
    eyebrow: "04 · VENDAS",
    title: "As compras aparecem na sala, em ordem cronológica.",
    intro:
      "Depois de a oferta abrir, as notificações de compra surgem sobre o vídeo e no meio da conversa, com o intervalo que definir.",
    heroVisual: "sales",
    heroCaption: "Notificações de compra na sala — demonstração.",
    highlights: [
      "Aviso sobre o vídeo e linha destacada no chat",
      "Início a partir do momento da oferta",
      "Intervalo entre notificações configurável",
      "Cada notificação pode ser revista e editada",
    ],
    sections: [
      {
        title: "Preparadas no painel",
        body:
          "Cada notificação tem nome, produto e momento. Pode escrevê-las à mão ou gerar sugestões e aprová-las uma a uma antes de entrarem na sessão.",
      },
      {
        title: "No vídeo e no chat",
        body:
          "O aviso aparece discretamente sobre a apresentação e também no chat, destacado, sem interromper a leitura das restantes mensagens.",
        visual: "sales",
        visualCaption: "Compra anunciada no chat — demonstração.",
      },
      {
        title: "Sob o seu controlo",
        body:
          "Nada é publicado sem aprovação. Pode editar o texto, alterar o momento ou descartar qualquer notificação antes da sessão.",
      },
    ],
    metaTitle: "Notificações de venda — Novawebinar",
    metaDescription:
      "Avisos de compra no vídeo e no chat, com intervalo configurável e aprovação individual antes de entrarem na sessão.",
  },
  {
    slug: "replay",
    menuTitle: "Replay",
    menuCopy: "A sessão disponível para rever depois do ao vivo.",
    eyebrow: "05 · REPLAY",
    title: "Quem falhou a sessão pode assistir depois.",
    intro:
      "Quando ativa o replay, a gravação fica disponível na sala depois do horário da sessão. Quem entra em replay vê o vídeo do início, com a possibilidade de avançar e recuar.",
    heroVisual: "replay",
    heroCaption: "Sala em modo replay — demonstração.",
    highlights: [
      "Ativação por webinar, quando fizer sentido",
      "Vídeo do início, com avançar e recuar",
      "Identificado como replay, separado do ao vivo",
      "Visualizações de replay contadas na análise",
    ],
    sections: [
      {
        title: "Uma escolha por webinar",
        body:
          "O replay é um interruptor na configuração da sessão. Enquanto estiver ativo, a gravação fica acessível na sala; quando o desativa, a sala volta a abrir apenas nos horários marcados.",
      },
      {
        title: "Controlo total sobre o vídeo",
        body:
          "Ao contrário da sessão ao vivo, em que todos acompanham o mesmo instante, no replay cada pessoa controla a reprodução: pausa, avança e volta atrás ao seu ritmo.",
        visual: "replay",
        visualCaption: "Barra de progresso do replay — demonstração.",
      },
      {
        title: "Separado na análise",
        body:
          "A análise distingue quem assistiu ao vivo de quem assistiu em replay, para perceber quantas pessoas a sessão recupera depois do horário.",
      },
    ],
    metaTitle: "Replay — Novawebinar",
    metaDescription:
      "Disponibilize a gravação depois da sessão: replay com controlo de reprodução e visualizações contadas separadamente na análise.",
  },
  {
    slug: "assistente-ia",
    menuTitle: "Assistente IA",
    menuCopy: "Apoio ao suporte privado, com escalação para a equipa.",
    eyebrow: "06 · ASSISTÊNCIA",
    title: "Suporte com contexto, sem perder o controlo.",
    intro:
      "O Agente IA apoia as conversas privadas de suporte usando as FAQs, as objeções e o conteúdo já apresentado na sessão. Identifica-se sempre como assistente.",
    heroVisual: "assistance",
    heroCaption: "Assistente no suporte privado — demonstração.",
    highlights: [
      "Conhecimento limitado ao momento atual da sessão",
      "Respostas baseadas nas fontes que configurar",
      "Escalação para atendimento humano",
      "Pode ser pausado em cada conversa",
    ],
    sections: [
      {
        title: "Quatro modos de funcionamento",
        body:
          "Desativado, copiloto (sugere respostas à equipa), híbrido e automático. Escolhe o nível de autonomia consoante o tipo de sessão.",
      },
      {
        title: "Nunca inventa condições comerciais",
        body:
          "O assistente não cria preços, descontos ou garantias. Quando não tem base para responder, encaminha a conversa para a equipa.",
        visual: "assistance",
        visualCaption: "Resposta assistida com nota de segurança — demonstração.",
      },
      {
        title: "A equipa decide",
        body:
          "Cada conversa tem um interruptor para pausar o assistente. As conversas com assistência ficam identificadas na análise, separadas das respostas humanas.",
      },
    ],
    metaTitle: "Assistente IA — Novawebinar",
    metaDescription:
      "Assistência no suporte privado com base no conteúdo da sessão, identificada como assistente e com escalação para a equipa.",
  },
  {
    slug: "analise",
    menuTitle: "Análise e retenção",
    menuCopy: "Presença, retenção, pontos de saída e filtros por período.",
    eyebrow: "07 · ANÁLISE",
    title: "Saiba o que aconteceu em cada momento da sessão.",
    intro:
      "Acompanhe inscrições, presenças, tempo médio assistido e o ponto em que cada participante saiu — no conjunto dos webinares ou em cada sessão.",
    heroVisual: "dashboard",
    heroCaption: "Painel de acompanhamento — pré-visualização ilustrativa.",
    highlights: [
      "Inscritos, presentes ao vivo e em replay",
      "Tempo médio assistido por sessão",
      "Pontos de saída e picos de atenção",
      "Filtro por hoje, ontem, semana ou período personalizado",
    ],
    sections: [
      {
        title: "Do geral ao detalhe",
        body:
          "A visão geral reúne todos os webinares; cada webinar tem a sua própria página com as mesmas métricas aplicadas apenas àquela sessão.",
      },
      {
        title: "Onde as pessoas saem",
        body:
          "O gráfico de participação mostra a curva ao longo do vídeo e assinala os momentos com mais saídas, para ajustar o conteúdo na versão seguinte.",
        visual: "dashboard",
        visualCaption: "Curva de participação — pré-visualização ilustrativa.",
      },
      {
        title: "Participantes e exportação",
        body:
          "A lista de participantes mostra origem, dispositivo, presença e se chegou ao momento da oferta, e pode ser exportada.",
      },
    ],
    metaTitle: "Análise e retenção — Novawebinar",
    metaDescription:
      "Presença, tempo médio assistido, pontos de saída e filtros por período, no conjunto dos webinares ou em cada sessão.",
  },
];

export function findFeature(slug: string) {
  return landingFeatures.find((feature) => feature.slug === slug);
}
