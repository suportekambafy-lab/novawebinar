import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, Bell, ChevronDown, CircleCheck, RotateCcw, ShoppingBag } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { EASE, Item, Parallax, Reveal, Stagger, Words } from "@/components/landing/motion";
import { DesktopShot } from "@/components/landing/shots";
import { Vitrine } from "@/components/landing/vitrine";
import {
  CheckoutsSection,
  FinalCta,
  FunnelSection,
  IntegrationsSection,
  Kicker,
  LiveSection,
  StepsSection,
} from "@/components/landing/sections";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Novawebinar — venda todos os dias com webinars que correm sozinhos" },
      {
        name: "description",
        content:
          "Grave uma vez e apresente à hora marcada, todos os dias ou no instante do clique. Agente IA no chat, vendas em tempo real, automações por WhatsApp e e-mail e as métricas de cada sessão.",
      },
      {
        property: "og:title",
        content: "Novawebinar — venda todos os dias com webinars que correm sozinhos",
      },
      {
        property: "og:description",
        content:
          "Grave uma vez e apresente à hora marcada, todos os dias ou no instante do clique. Agente IA no chat, vendas em tempo real, automações e métricas de cada sessão.",
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
      <motion.button
        type="submit"
        className="site-btn site-btn-primary"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.15 }}
      >
        Começar <ArrowRight aria-hidden="true" />
      </motion.button>
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
    <Reveal className={center ? "mx-auto text-center" : ""}>
      <h2 className={`max-w-[20ch] text-site-h2 ${center ? "mx-auto" : ""}`}>{title}</h2>
      {children && (
        <p className={`mt-4 max-w-[60ch] text-site-lead text-s-text-2 ${center ? "mx-auto" : ""}`}>
          {children}
        </p>
      )}
    </Reveal>
  );
}

function MoreLink({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <Link to="/funcionalidades/$slug" params={{ slug }} className="site-link group mt-8">
      {children}{" "}
      <ArrowRight
        aria-hidden="true"
        className="transition-transform duration-[var(--duration-fast)] group-hover:translate-x-1"
      />
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
    visual: () => <DesktopShot kind="editor-agenda" />,
  },
  {
    label: "Apresentar",
    slug: "chat",
    title: "O chat acompanha o vídeo.",
    copy: "As mensagens que preparou entram no minuto certo, e quem está na sala conversa a sério.",
    visual: () => <DesktopShot kind="editor-chat" />,
  },
  {
    label: "Oferta",
    slug: "oferta",
    title: "A oferta entra no momento certo.",
    copy: "Produto, preço e contagem aparecem na sala no segundo que definiu.",
    visual: () => <DesktopShot kind="sala-oferta" />,
  },
  {
    label: "Vendas",
    slug: "vendas",
    title: "As compras aparecem na sala.",
    copy: "Os avisos de venda surgem no vídeo e no chat, um de cada vez.",
    visual: () => <DesktopShot kind="sala-vendas" />,
  },
  {
    label: "Acompanhar",
    slug: "analise",
    title: "Veja o que aconteceu em cada minuto.",
    copy: "Presenças, replay, cliques na oferta e o momento em que cada pessoa saiu.",
    visual: () => <DesktopShot kind="metricas" />,
  },
];

/**
 * Separadores manuais (sem rotação automática nem botão de pausa): só o painel activo é desenhado.
 * A pílula activa desliza entre os separadores e o painel troca com um deslize curto.
 */
function FeatureTabs() {
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState(1);
  const reduced = useReducedMotion();
  const tab = tabs[active]!;
  const go = (next: number) => {
    setDirection(next > active ? 1 : -1);
    setActive(next);
  };
  const slide = reduced ? 0 : 28;
  return (
    <div className="mt-12">
      <Reveal
        delay={0.1}
        className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none]"
      >
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
              className={`site-tab h-12 rounded-full px-5 text-site-small font-medium transition-colors duration-[var(--duration-fast)] ${index === active ? "text-white" : "text-s-text-2 hover:text-s-text"}`}
              onClick={() => go(index)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
                event.preventDefault();
                const next =
                  (active + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
                go(next);
                (
                  event.currentTarget.parentElement?.children[next] as HTMLElement | undefined
                )?.focus();
              }}
            >
              {index === active && (
                <motion.span
                  layoutId="tab-pill"
                  className="site-tab-pill"
                  transition={
                    reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }
                  }
                />
              )}
              {item.label}
            </button>
          ))}
        </div>
      </Reveal>
      <div
        id="tab-painel"
        role="tabpanel"
        aria-labelledby={`tab-${tab.slug}`}
        className="mt-10 grid items-center gap-8 lg:grid-cols-[7fr_5fr] lg:gap-16"
      >
        <div className="overflow-hidden rounded-[var(--radius-panel)] bg-warm-100 p-3 sm:p-6">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={tab.slug}
              custom={direction}
              initial={{ opacity: 0, x: slide * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -slide * direction }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {tab.visual()}
            </motion.div>
          </AnimatePresence>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab.slug}
            initial={{ opacity: 0, y: reduced ? 0 : 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -8 }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            <h3 className="text-site-h3">{tab.title}</h3>
            <p className="mt-4 text-site-body text-s-text-2">{tab.copy}</p>
            <MoreLink slug={tab.slug}>Saber mais</MoreLink>
          </motion.div>
        </AnimatePresence>
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
  [
    "As vendas entram sozinhas?",
    "Sim. Ligue a Kambafy, a Hotmart, a Kiwify, a Eduzz ou o Stripe (ou um webhook) e cada compra aprovada fica no webinar certo: na receita, no funil e nos avisos de venda da sala.",
  ],
  [
    "Posso testar duas versões do mesmo webinar?",
    "Pode. O teste A/B divide o tráfego de um só link entre duas salas, conta visitas, presença e compras de cada uma e diz quando há uma vencedora.",
  ],
  [
    "Preciso de outra ferramenta para as métricas?",
    "Não. Inscrições, presença ao vivo e no replay, retenção minuto a minuto, cliques na oferta e compras ficam no painel e nas métricas de cada sessão.",
  ],
] as const;

/** O hero: o título ao centro, palavra a palavra, com o ponto final na cor da marca; depois a vitrine. */
function Hero() {
  const reduced = useReducedMotion();
  const enter = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease: EASE, delay },
  });
  return (
    <section data-surface="base" className="relative overflow-hidden pt-[var(--section-y-tight)]">
      <div className="site-wrap flex flex-col items-center text-center">
        <motion.div {...enter(0)}>
          <Kicker>Webinars automatizados com IA</Kicker>
        </motion.div>
        <h1 className="max-w-[18ch] text-site-display font-normal">
          <Words text="Venda todos os dias com webinars que correm sozinhos" />
          <span className="text-[var(--accent-600)]" aria-hidden="true">
            .
          </span>
        </h1>
        <motion.p className="mt-6 max-w-[60ch] text-site-lead text-s-text-2" {...enter(0.55)}>
          Grave uma vez e apresente à hora marcada, todos os dias ou no instante do clique. Agente
          IA no chat, vendas em tempo real, automações por WhatsApp e e-mail e as métricas de cada
          sessão.
        </motion.p>
        <motion.div
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
          {...enter(0.7)}
        >
          <Link
            to="/auth/register"
            className="site-btn site-btn-primary bg-[var(--accent-600)] text-white hover:bg-[var(--accent-700)]"
          >
            Criar conta grátis
          </Link>
          <a href="#como-funciona" className="site-btn site-btn-outline">
            Ver como funciona
          </a>
        </motion.div>
        <motion.p className="mt-4 text-site-small text-s-text-2" {...enter(0.8)}>
          <b className="font-semibold text-s-text">Sem instalar nada</b> · a primeira sala fica
          pronta em minutos
        </motion.p>
      </div>
      <motion.div
        className="mt-12 -mx-[var(--gutter)] sm:mx-0"
        initial={{ opacity: 0, y: reduced ? 0 : 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.5 }}
      >
        <Vitrine />
      </motion.div>
    </section>
  );
}

function LandingPage() {
  const reduced = useReducedMotion();
  useEffect(() => {
    if (window.location.hostname === "admin.novawebinar.com")
      window.location.replace(`/dashboard${window.location.search}`);
  }, []);

  return (
    <div data-site className="min-h-screen bg-white text-[var(--ds-gray-1000)]">
      <SiteHeader />
      <main>
        <Hero />

        <LiveSection />

        <StepsSection />

        <section id="funcionalidades" data-surface="base" className="site-section scroll-mt-16">
          <div className="site-wrap">
            <SectionHead title="Tudo o que acontece na sala, preparado por si." center />
            <FeatureTabs />
          </div>
        </section>

        <CheckoutsSection />

        <IntegrationsSection />

        <FunnelSection />

        <section id="automacoes" data-surface="warm" className="site-section scroll-mt-16">
          <div className="site-wrap">
            <SectionHead title="A conversa continua depois da sessão.">
              Lembretes, replay e oferta por email e WhatsApp, a cada pessoa no momento certo.
            </SectionHead>
            <Stagger as="ul" className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" gap={0.1}>
              {automations.map(({ icon: Icon, title, copy }, index) => (
                <Item
                  key={title}
                  as="li"
                  className="site-lift rounded-[var(--radius-card-site)] bg-s-card p-6"
                >
                  <motion.span
                    className="site-icon size-12"
                    initial={{ rotate: reduced ? 0 : -12, scale: reduced ? 1 : 0.7 }}
                    whileInView={{ rotate: 0, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 16,
                      delay: 0.25 + index * 0.1,
                    }}
                  >
                    <Icon className="size-6" aria-hidden="true" />
                  </motion.span>
                  <h3 className="mt-6 text-site-h4">{title}</h3>
                  <p className="mt-2 text-site-small text-s-text-2">{copy}</p>
                </Item>
              ))}
            </Stagger>
            <Reveal delay={0.1} distance={32} className="mt-12">
              <Parallax range={16}>
                <DesktopShot kind="fluxo" />
              </Parallax>
            </Reveal>
            <Reveal delay={0.2}>
              <Link to="/auth/register" className="site-btn site-btn-primary mt-10">
                Criar conta
              </Link>
            </Reveal>
          </div>
        </section>

        <section data-surface="base" className="site-section">
          <div className="site-wrap grid items-center gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
            <div>
              <SectionHead title="Responda a todos, mesmo sem estar lá.">
                As mensagens privadas da sala num só sítio, com o Agente a ajudar e a passar à
                equipa quando é preciso.
              </SectionHead>
              <Reveal delay={0.2}>
                <MoreLink slug="assistente-ia">Saber mais sobre o atendimento</MoreLink>
              </Reveal>
            </div>
            <Reveal distance={32} delay={0.1}>
              <Parallax range={20}>
                <DesktopShot kind="atendimento" />
              </Parallax>
            </Reveal>
          </div>
        </section>

        <FinalCta>
          <EmailStart id="email-fim" />
        </FinalCta>

        <section id="perguntas" data-surface="base" className="site-section scroll-mt-16">
          <div className="site-wrap grid gap-10 lg:grid-cols-[5fr_7fr] lg:gap-16">
            <div>
              <SectionHead title="Ficou com dúvidas?">
                As respostas curtas ao que mais nos perguntam.
              </SectionHead>
              <Reveal delay={0.15}>
                <Link to="/funcionalidades" className="site-btn site-btn-outline mt-8">
                  Ver funcionalidades
                </Link>
              </Reveal>
            </div>
            <Stagger className="border-t border-s-line" gap={0.07}>
              {questions.map(([question, answer]) => (
                <Item key={question} distance={12}>
                  <details className="site-faq border-b border-s-line">
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
                </Item>
              ))}
            </Stagger>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
