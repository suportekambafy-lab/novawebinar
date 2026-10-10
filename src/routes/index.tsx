import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  ChartLine,
  ChevronDown,
  CircleCheck,
  MousePointerClick,
  RotateCcw,
  ShoppingBag,
  Users,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import {
  AssistanceVisual,
  DashboardVisual,
  OfferVisual,
  RoomVisual,
  ScheduleVisual,
} from "@/components/landing/product-visuals";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Novawebinar — grave uma vez, apresente todos os dias" },
      {
        name: "description",
        content:
          "Crie webinars automatizados com sessões recorrentes, chat programado, oferta e análise de retenção.",
      },
      { property: "og:title", content: "Novawebinar — grave uma vez, apresente todos os dias" },
      {
        property: "og:description",
        content:
          "Crie webinars automatizados com sessões recorrentes, chat programado, oferta e análise de retenção.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

/** Um só campo, como o «CPF → Continuar» do Nubank: o email segue para o registo. Sem JS também funciona (GET). */
function EmailStart({ id }: { id: string }) {
  const navigate = useNavigate();
  return (
    <form
      action="/auth/register"
      method="get"
      className="flex flex-col gap-3 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
        void navigate({ to: "/auth/register", search: { email } });
      }}
    >
      <label htmlFor={id} className="sr-only">
        O seu email
      </label>
      <input
        id={id}
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="O seu email"
        className="site-field sm:flex-1"
      />
      <button type="submit" className="site-btn site-btn-primary">
        Começar <ArrowRight aria-hidden="true" />
      </button>
    </form>
  );
}

function SectionHead({
  title,
  children,
  center = false,
}: {
  title: string;
  children?: ReactNode;
  center?: boolean;
}) {
  return (
    <div className={center ? "mx-auto text-center" : ""}>
      <h2 className={`max-w-[20ch] text-site-h2 ${center ? "mx-auto" : ""}`}>{title}</h2>
      {children && (
        <p className={`mt-4 max-w-[60ch] text-site-lead text-s-text-2 ${center ? "mx-auto" : ""}`}>
          {children}
        </p>
      )}
    </div>
  );
}

function MoreLink({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <Link to="/funcionalidades/$slug" params={{ slug }} className="site-link mt-8">
      {children} <ArrowRight aria-hidden="true" />
    </Link>
  );
}

const steps = [
  ["Carregue o vídeo", "Use uma gravação que já tem."],
  ["Escolha quando a sala abre", "Uma vez, todos os dias ou à hora que a pessoa escolher."],
  ["Acompanhe e venda", "Veja quem ficou, quem clicou e quem comprou."],
] as const;

const tabs = [
  {
    label: "Programar",
    slug: "sessoes",
    title: "Sessão única, diária ou à hora de cada pessoa.",
    copy: "Escolha uma data, a repetição diária ou semanal, ou o just in time.",
    visual: () => <ScheduleVisual />,
  },
  {
    label: "Apresentar",
    slug: "chat",
    title: "O chat acompanha o vídeo.",
    copy: "As mensagens que preparou entram no minuto certo, e quem está na sala conversa a sério.",
    visual: () => <RoomVisual />,
  },
  {
    label: "Oferta",
    slug: "oferta",
    title: "A oferta entra no momento certo.",
    copy: "Produto, preço e contagem aparecem na sala no segundo que definiu.",
    visual: () => <OfferVisual />,
  },
  {
    label: "Vendas",
    slug: "vendas",
    title: "As compras aparecem na sala.",
    copy: "Os avisos de venda surgem no vídeo e no chat, um de cada vez.",
    visual: () => <RoomVisual sales />,
  },
  {
    label: "Acompanhar",
    slug: "analise",
    title: "Veja o que aconteceu em cada minuto.",
    copy: "Presenças, replay, cliques na oferta e o momento em que cada pessoa saiu.",
    visual: () => <DashboardVisual />,
  },
];

/** Separadores manuais (sem rotação automática nem botão de pausa): só o painel activo é desenhado. */
function FeatureTabs() {
  const [active, setActive] = useState(0);
  const tab = tabs[active]!;
  return (
    <div className="mt-12">
      <div className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none]">
        <div
          role="tablist"
          aria-label="Funcionalidades"
          className="mx-auto flex w-max gap-1 rounded-full bg-s-card p-1"
        >
          {tabs.map((item, index) => (
            <button
              key={item.label}
              type="button"
              role="tab"
              id={`tab-${item.slug}`}
              aria-selected={index === active}
              aria-controls="tab-painel"
              tabIndex={index === active ? 0 : -1}
              className={`h-12 rounded-full px-5 text-site-small font-medium transition-colors duration-[var(--duration-fast)] ${index === active ? "bg-s-action text-white" : "text-s-text-2 hover:text-s-text"}`}
              onClick={() => setActive(index)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                event.preventDefault();
                const next =
                  (active + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                setActive(next);
                (
                  event.currentTarget.parentElement?.children[next] as HTMLElement | undefined
                )?.focus();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div
        id="tab-painel"
        role="tabpanel"
        aria-labelledby={`tab-${tab.slug}`}
        className="mt-10 grid items-center gap-8 lg:grid-cols-[7fr_5fr] lg:gap-16"
      >
        <div className="rounded-[var(--radius-panel)] bg-warm-100 p-4 sm:p-8">{tab.visual()}</div>
        <div>
          <h3 className="text-site-h3">{tab.title}</h3>
          <p className="mt-4 text-site-body text-s-text-2">{tab.copy}</p>
          <MoreLink slug={tab.slug}>Saber mais</MoreLink>
        </div>
      </div>
    </div>
  );
}

const automations = [
  {
    icon: Bell,
    title: "Lembrete antes de começar",
    copy: "Por email e WhatsApp, para a pessoa não faltar.",
  },
  {
    icon: RotateCcw,
    title: "Replay para quem faltou",
    copy: "Quem não entrou recebe o link para ver depois.",
  },
  {
    icon: ShoppingBag,
    title: "Oferta para quem não comprou",
    copy: "Uma sequência curta com a oferta, no tempo certo.",
  },
  {
    icon: CircleCheck,
    title: "Pára quando a pessoa compra",
    copy: "A compra aprovada cancela as mensagens de venda dessa oferta.",
  },
];

const insights = [
  { icon: Users, title: "Presença e replay", copy: "Quem entrou ao vivo e quem viu depois." },
  {
    icon: MousePointerClick,
    title: "Cliques na oferta",
    copy: "Quantas pessoas abriram a oferta e quando.",
  },
  { icon: ChartLine, title: "Retenção minuto a minuto", copy: "Onde a atenção sobe e onde cai." },
];

const questions = [
  [
    "Preciso de estar presente na sessão?",
    "Não. A sala abre à hora marcada com o vídeo gravado, e o chat e a oferta entram nos momentos que definiu.",
  ],
  [
    "Posso usar um vídeo que já gravei?",
    "Sim. Carregue a gravação que já tem; a sala mostra-a na forma original, horizontal ou vertical.",
  ],
  [
    "Como funciona o replay?",
    "Quando o ativa, a gravação fica na sala depois da sessão. Quem entra em replay pode pausar, avançar e recuar.",
  ],
  [
    "Funciona no telemóvel?",
    "Sim. A sala, o chat e a oferta foram pensados primeiro para o telemóvel, ao alto ou deitado.",
  ],
  [
    "Quem responde às mensagens privadas?",
    "A sua equipa, no Atendimento. O Agente ajuda com base no conteúdo e passa a conversa à equipa quando é preciso.",
  ],
] as const;

function LandingPage() {
  useEffect(() => {
    if (window.location.hostname === "admin.novawebinar.com")
      window.location.replace(`/dashboard${window.location.search}`);
  }, []);

  return (
    <div data-site className="min-h-screen bg-white text-[var(--ds-gray-1000)]">
      <SiteHeader />
      <main>
        <section data-surface="base" className="pb-[var(--section-y)] pt-[var(--section-y-tight)]">
          <div className="site-wrap grid items-center gap-12 lg:grid-cols-[7fr_5fr] lg:gap-16">
            <div>
              <h1 className="max-w-[16ch] text-site-display">
                Grave uma vez. Apresente todos os dias.
              </h1>
              <p className="mt-6 max-w-[48ch] text-site-lead text-s-text-2">
                A sala abre sozinha, o chat e a oferta entram no momento certo, e as mensagens
                seguem para quem não comprou.
              </p>
              <div className="mt-8 max-w-[34rem] rounded-[var(--radius-panel)] bg-s-card p-5 sm:p-6">
                <EmailStart id="email-hero" />
              </div>
              <a href="#como-funciona" className="site-link mt-6">
                Ver como funciona
              </a>
            </div>
            <div className="rounded-[var(--radius-panel)] bg-warm-100 p-4 sm:p-6">
              <RoomVisual />
            </div>
          </div>
        </section>

        <section id="como-funciona" data-surface="warm" className="site-section scroll-mt-16">
          <div className="site-wrap">
            <SectionHead title="Três passos. Depois é automático." />
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
              {steps.map(([title, copy], index) => (
                <li key={title} className="rounded-[var(--radius-card-site)] bg-s-card p-6 sm:p-8">
                  <span className="site-icon size-10 text-site-small font-semibold tabular-nums">
                    {index + 1}
                  </span>
                  <h3 className="mt-6 text-site-h3">{title}</h3>
                  <p className="mt-2 text-site-body text-s-text-2">{copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="funcionalidades" data-surface="base" className="site-section scroll-mt-16">
          <div className="site-wrap">
            <SectionHead title="Tudo o que acontece na sala, preparado por si." center />
            <FeatureTabs />
          </div>
        </section>

        <section id="automacoes" data-surface="inverse" className="site-section scroll-mt-16">
          <div className="site-wrap">
            <SectionHead title="A conversa continua depois da sessão.">
              Lembretes, replay e oferta por email e WhatsApp, a cada pessoa no momento certo.
            </SectionHead>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {automations.map(({ icon: Icon, title, copy }) => (
                <li key={title} className="rounded-[var(--radius-card-site)] bg-s-card p-6">
                  <span className="site-icon size-12">
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <h3 className="mt-6 text-site-h4">{title}</h3>
                  <p className="mt-2 text-site-small text-s-text-2">{copy}</p>
                </li>
              ))}
            </ul>
            <Link to="/auth/register" className="site-btn site-btn-primary mt-10">
              Criar conta
            </Link>
          </div>
        </section>

        <section data-surface="base" className="site-section">
          <div className="site-wrap grid items-center gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
            <div>
              <SectionHead title="Saiba em que minuto as pessoas saem." />
              <ul className="mt-8 grid gap-5">
                {insights.map(({ icon: Icon, title, copy }) => (
                  <li key={title} className="flex gap-4">
                    <span className="site-icon size-8">
                      <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <p className="text-site-body text-s-text-2">
                      <strong className="font-semibold text-s-text">{title}.</strong> {copy}
                    </p>
                  </li>
                ))}
              </ul>
              <MoreLink slug="analise">Saber mais sobre a análise</MoreLink>
            </div>
            <DashboardVisual />
          </div>
        </section>

        <section data-surface="warm" className="site-section">
          <div className="site-wrap grid items-center gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
            <div>
              <SectionHead title="Responda a todos, mesmo sem estar lá.">
                As mensagens privadas da sala num só sítio, com o Agente a ajudar e a passar à
                equipa quando é preciso.
              </SectionHead>
              <MoreLink slug="assistente-ia">Saber mais sobre o atendimento</MoreLink>
            </div>
            <AssistanceVisual />
          </div>
        </section>

        <section id="perguntas" data-surface="base" className="site-section scroll-mt-16">
          <div className="site-wrap grid gap-10 lg:grid-cols-[5fr_7fr] lg:gap-16">
            <div>
              <SectionHead title="Ficou com dúvidas?">
                As respostas curtas ao que mais nos perguntam.
              </SectionHead>
              <Link to="/funcionalidades" className="site-btn site-btn-outline mt-8">
                Ver funcionalidades
              </Link>
            </div>
            <div className="border-t border-s-line">
              {questions.map(([question, answer]) => (
                <details key={question} className="site-faq border-b border-s-line">
                  <summary className="flex min-h-16 items-center justify-between gap-4 py-4 text-site-body font-medium">
                    {question}
                    <ChevronDown
                      className="site-faq-chevron size-5 flex-none transition-transform duration-[var(--duration-base)]"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="max-w-[60ch] pb-5 text-site-body text-s-text-2">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section data-surface="tint" className="site-section">
          <div className="site-wrap">
            <SectionHead title="Comece hoje. A primeira sala fica pronta em minutos." />
            <div className="mt-8 max-w-[34rem]">
              <EmailStart id="email-fim" />
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
