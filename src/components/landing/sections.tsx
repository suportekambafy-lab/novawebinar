/**
 * As secções animadas da página inicial (fora do hero): o formato Live no telemóvel, o «Como funciona» em
 * cartões, as plataformas de checkout, as integrações a flutuar, o funil e a chamada final. Os textos e as
 * imagens são nossos; o movimento segue landing/motion.tsx e os estilos «vt-» de styles.css.
 */
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Globe, Share2, Webhook as WebhookIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CountUp, EASE, Reveal, Stagger, Item } from "@/components/landing/motion";
import { PhoneShot } from "@/components/landing/shots";
import painel from "@/assets/landing/painel.webp";
import eduzz from "@/assets/integrations/eduzz.png";
import hotmart from "@/assets/integrations/hotmart.png";
import kambafy from "@/assets/integrations/kambafy.png";
import kiwify from "@/assets/integrations/kiwify.png";
import meta from "@/assets/integrations/meta.jpg";
import googleAds from "@/assets/integrations/google_ads.jpg";
import stripe from "@/assets/integrations/stripe.png";
import tiktok from "@/assets/integrations/tiktok.svg";

/** O rótulo pequeno por cima dos títulos («COMO FUNCIONA»), com o ponto da marca. */
export function Kicker({ children, pill = false }: { children: ReactNode; pill?: boolean }) {
  return (
    <p
      className={`mb-4 inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-[.16em] ${pill ? "rounded-full bg-[var(--s-card)] px-3 py-1.5" : "text-[var(--accent-700)]"}`}
    >
      <span className="size-1.5 rounded-full bg-[var(--accent-600)]" aria-hidden="true" />
      {children}
    </p>
  );
}

/** Um título em duas cores: a primeira parte leve, a segunda a negrito. */
export function TwoTone({
  light,
  bold,
  className = "",
}: {
  light: string;
  bold: string;
  className?: string;
}) {
  return (
    <h2 className={`text-site-h2 ${className}`}>
      <span className="font-normal">{light}</span> <span className="font-semibold">{bold}</span>
    </h2>
  );
}

/** Uma linha com o visto; vai dentro de um `Item as="li"`, por isso não é ela a `<li>`. */
function CheckLine({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-start gap-3 text-site-body text-s-text-2">
      <span className="site-icon mt-1 size-5 flex-none">
        <Check className="size-3" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span>{children}</span>
    </span>
  );
}

/* ---------- Formato Live ---------- */

export function LiveSection() {
  const reduced = useReducedMotion();
  return (
    <section data-surface="base" className="site-section overflow-hidden">
      <div className="site-wrap grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <Reveal>
            <Kicker pill>Novidade · formato Live</Kicker>
            <TwoTone
              light="O seu webinar com cara de live,"
              bold="no ecrã inteiro do telemóvel"
              className="max-w-[18ch]"
            />
            <p className="mt-5 max-w-[52ch] text-site-lead text-s-text-2">
              Grave ao alto, em 9:16, e escolha o formato Live. No telemóvel o vídeo ocupa o ecrã
              todo e o chat corre por cima, como numa live de rede social. A oferta aparece num
              cartão com preço, contagem e botão, sem tirar ninguém da aula.
            </p>
          </Reveal>
          <Stagger as="ul" className="mt-7 grid gap-3" gap={0.1} delay={0.2}>
            {[
              "Selo «Ao vivo» e o número de pessoas a assistir no topo.",
              "Chat por cima do vídeo, com as mensagens programadas a entrar no minuto certo.",
              "Oferta em cartão: o checkout abre noutro separador e a aula continua.",
              "Horários, automações, métricas e integrações funcionam da mesma forma.",
            ].map((line) => (
              <Item key={line} as="li" distance={12}>
                <CheckLine>{line}</CheckLine>
              </Item>
            ))}
          </Stagger>
          <Reveal delay={0.4} className="mt-8 flex flex-wrap items-center gap-4">
            <Link to="/auth/register" className="site-btn site-btn-primary">
              Criar conta grátis
            </Link>
            <Link to="/funcionalidades" className="site-link">
              Ver a sala <ArrowRight aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
        <motion.div
          className="relative mx-auto w-full max-w-[22rem]"
          initial={{ opacity: 0, y: reduced ? 0 : 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.9, ease: EASE }}
        >
          <div className="site-glow" aria-hidden="true" />
          <div className="mx-auto w-[72%] sm:w-[64%]">
            <PhoneShot kind="live-vertical-oferta" />
          </div>
          {[
            ["Vídeo vertical 9:16", "left-0 top-[18%]", 0],
            ["Chat por cima", "right-0 top-[44%]", 2],
            ["Oferta sem sair da aula", "left-2 bottom-[16%]", 4],
          ].map(([label, pos, i]) => (
            <span
              key={label}
              className={`vt-float absolute ${pos} inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[13px] font-semibold text-[var(--ds-gray-1000)] shadow-[0_12px_30px_-12px_rgba(0,0,0,.35)]`}
              style={{ "--i": i } as React.CSSProperties}
            >
              <i className="size-2 rounded-full bg-[var(--accent-600)]" aria-hidden="true" />
              {label}
            </span>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ---------- Como funciona ---------- */

const STEPS = [
  [
    "Crie o webinar",
    "Dê-lhe um nome e escolha o vídeo da biblioteca: uma gravação que já tem, ou uma nova.",
  ],
  [
    "Personalize a sala",
    "Formato, cores, nome do apresentador e a página de inscrição com os campos que quiser.",
  ],
  [
    "Prepare a experiência",
    "Os comentários do chat, os momentos para seguir nas redes e os avisos de venda, no minuto certo.",
  ],
  [
    "Marque o horário",
    "Uma data, repetição diária ou semanal, just in time ou sempre disponível. A sala abre sozinha.",
  ],
  [
    "Ligue as automações",
    "Lembretes, replay e oferta por WhatsApp e e-mail. Param quando a pessoa compra.",
  ],
  [
    "Acompanhe e optimize",
    "Métricas de cada sessão, o atendimento com Agente IA e o teste A/B para decidir o que fica.",
  ],
] as const;

export function StepsSection() {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const go = (next: number) => {
    const el = track.current;
    if (!el) return;
    const i = Math.max(0, Math.min(STEPS.length - 1, next));
    const card = el.children[i] as HTMLElement | undefined;
    if (card) el.scrollTo({ left: card.offsetLeft, behavior: "smooth" });
    setIndex(i);
  };
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => {
      let best = 0;
      let distance = Infinity;
      for (let i = 0; i < el.children.length; i += 1) {
        const d = Math.abs((el.children[i] as HTMLElement).offsetLeft - el.scrollLeft);
        if (d < distance) {
          distance = d;
          best = i;
        }
      }
      setIndex(best);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <section
      id="como-funciona"
      data-surface="inverse"
      className="relative scroll-mt-16 overflow-hidden"
    >
      {/* O fundo: o painel do produto desfocado, por trás de um degradé escuro. */}
      <img
        src={painel}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover opacity-[.12] blur-[3px]"
        loading="lazy"
        decoding="async"
      />
      <div
        className="absolute inset-0 bg-[radial-gradient(70%_60%_at_20%_30%,rgba(10,10,10,.95),rgba(10,10,10,.75)_60%,rgba(10,10,10,.6))]"
        aria-hidden="true"
      />
      <div className="site-wrap relative grid items-center gap-10 py-[var(--section-y)] lg:grid-cols-[5fr_7fr] lg:gap-14">
        <div>
          <Reveal>
            <Kicker pill>Como funciona</Kicker>
            <TwoTone
              light="Configure em minutos,"
              bold="mesmo sem conhecimento técnico"
              className="max-w-[18ch]"
            />
            <p className="mt-5 max-w-[46ch] text-site-lead text-s-text-2">
              Seis passos e o webinar está no ar, a vender todos os dias sem ninguém atrás do ecrã.
            </p>
          </Reveal>
          <Reveal delay={0.15} className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/auth/register" className="site-btn site-btn-primary">
              Começar agora <ArrowRight aria-hidden="true" />
            </Link>
            <a href="#funcionalidades" className="site-btn site-btn-outline">
              Ver a plataforma
            </a>
          </Reveal>
          <div className="mt-10 flex items-center gap-4">
            <button
              type="button"
              className="vt-ctrl"
              onClick={() => go(index - 1)}
              aria-label="Passo anterior"
              disabled={index === 0}
            >
              <ArrowLeft />
            </button>
            <button
              type="button"
              className="vt-ctrl"
              onClick={() => go(index + 1)}
              aria-label="Passo seguinte"
              disabled={index === STEPS.length - 1}
            >
              <ArrowRight />
            </button>
            <span className="vt-progress" aria-hidden="true">
              <em style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
            </span>
            <span className="text-site-small tabular-nums">
              <b className="text-white">{String(index + 1).padStart(2, "0")}</b>
              <span className="text-s-text-2"> / {String(STEPS.length).padStart(2, "0")}</span>
            </span>
          </div>
        </div>
        <div
          ref={track}
          className="vt-steps -mr-[var(--gutter)] pr-[var(--gutter)]"
          aria-label="Os seis passos"
        >
          {STEPS.map(([title, copy], i) => (
            <motion.article
              key={title}
              className="vt-step-card"
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.6, ease: EASE, delay: i * 0.06 }}
            >
              <b>{String(i + 1).padStart(2, "0")}</b>
              <h3 className="mt-6 text-site-h4 font-semibold">{title}</h3>
              <p className="mt-3 text-site-body text-[var(--ds-gray-900)]">{copy}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Checkouts ---------- */

const CHECKOUTS = [
  ["Kambafy", kambafy],
  ["Hotmart", hotmart],
  ["Kiwify", kiwify],
  ["Eduzz", eduzz],
  ["Stripe", stripe],
] as const;

export function CheckoutsSection() {
  return (
    <section data-surface="base" className="site-section">
      <div className="site-wrap text-center">
        <Reveal className="mx-auto">
          <Kicker>Checkouts</Kicker>
          <TwoTone
            light="As vendas aprovadas entram direto"
            bold="no painel e nas métricas"
            className="mx-auto max-w-[22ch]"
          />
          <p className="mx-auto mt-5 max-w-[58ch] text-site-lead text-s-text-2">
            Ligue a plataforma onde vende e cada compra aprovada fica no webinar certo: na receita,
            na etapa «Comprou» do funil, nos avisos de venda da sala e no teste A/B. Um reembolso
            avança o estado, nunca duplica.
          </p>
        </Reveal>
        <Stagger className="mt-10 flex flex-wrap justify-center gap-3" gap={0.08}>
          {CHECKOUTS.map(([name, logo]) => (
            <Item
              key={name}
              className="site-lift flex h-16 items-center gap-3 rounded-2xl border border-s-line bg-white px-6 text-site-body font-semibold"
            >
              <img
                src={logo}
                alt=""
                width={28}
                height={28}
                className="size-7 rounded-md"
                loading="lazy"
                decoding="async"
              />
              {name}
            </Item>
          ))}
          <Item className="site-lift flex h-16 items-center gap-3 rounded-2xl border border-s-line bg-white px-6 text-site-body font-semibold">
            <span className="site-icon size-7">
              <WebhookIcon className="size-4" aria-hidden="true" />
            </span>
            Webhook
          </Item>
        </Stagger>
      </div>
    </section>
  );
}

/* ---------- Integrações ---------- */

type Tile = { name: string; logo?: string; icon?: ReactNode };
const SALES: Tile[] = [
  { name: "Kambafy", logo: kambafy },
  { name: "Hotmart", logo: hotmart },
  { name: "Kiwify", logo: kiwify },
  { name: "Eduzz", logo: eduzz },
  { name: "Stripe", logo: stripe },
  { name: "Webhook de entrada", icon: <WebhookIcon /> },
];
const TRACKING: Tile[] = [
  { name: "Meta Pixel", logo: meta },
  { name: "TikTok Pixel", logo: tiktok },
  { name: "Google Tag", logo: googleAds },
  { name: "Webhook de saída", icon: <Share2 /> },
  { name: "WhatsApp", icon: <WaIcon /> },
  { name: "Grupos de WhatsApp", icon: <WaIcon /> },
];
const VIDEO: Tile[] = [
  { name: "Alojamento incluído", icon: <Globe /> },
  { name: "YouTube", icon: <PlayIcon /> },
  { name: "Vimeo", icon: <PlayIcon /> },
  { name: "Bunny Stream", icon: <PlayIcon /> },
  { name: "Panda Video", icon: <PlayIcon /> },
  { name: "HLS / MP4", icon: <PlayIcon /> },
];

function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3z" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function Column({ tiles, speed, down = false }: { tiles: Tile[]; speed: string; down?: boolean }) {
  const list = [...tiles, ...tiles];
  return (
    <div
      className={`vt-col ${down ? "is-down" : ""}`}
      style={{ "--vel": speed } as React.CSSProperties}
    >
      {list.map((t, i) => (
        <div key={`${t.name}-${i}`} className="vt-tile" aria-hidden={i >= tiles.length}>
          {t.logo ? (
            <img src={t.logo} alt="" loading="lazy" decoding="async" />
          ) : (
            <span>{t.icon}</span>
          )}
          {t.name}
        </div>
      ))}
    </div>
  );
}

export function IntegrationsSection() {
  return (
    <section data-surface="inverse" className="site-section overflow-hidden">
      <div className="site-wrap grid items-center gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
        <div>
          <Reveal>
            <Kicker pill>Integrações</Kicker>
            <TwoTone
              light="Ligue o seu webinar às ferramentas"
              bold="que já usa"
              className="max-w-[16ch]"
            />
            <p className="mt-5 max-w-[46ch] text-site-lead text-s-text-2">
              Plataformas de venda, píxeis de anúncios, WhatsApp e grupos, webhooks de entrada e de
              saída, e o vídeo alojado por nós ou onde já o tem.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <Link
              to="/funcionalidades/$slug"
              params={{ slug: "vendas" }}
              className="site-btn site-btn-primary mt-8"
            >
              Ver todas as integrações <ArrowRight aria-hidden="true" />
            </Link>
          </Reveal>
        </div>
        <Reveal distance={32} delay={0.1}>
          <div className="vt-cols" aria-label="Integrações disponíveis">
            <Column tiles={SALES} speed="30s" />
            <Column tiles={TRACKING} speed="36s" down />
            <Column tiles={VIDEO} speed="33s" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Funil ---------- */

const FUNNEL = [
  {
    label: "Visitantes",
    value: 6587,
    width: 100,
    tone: "var(--accent-100)",
    text: "var(--ds-gray-1000)",
  },
  {
    label: "Inscritos",
    value: 6078,
    width: 86,
    tone: "var(--accent-200)",
    text: "var(--ds-gray-1000)",
  },
  {
    label: "Assistiram",
    value: 4213,
    width: 72,
    tone: "color-mix(in oklab, var(--accent-600) 70%, white)",
    text: "#fff",
  },
  {
    label: "Clicaram na oferta",
    value: 1648,
    width: 58,
    tone: "color-mix(in oklab, var(--accent-600) 88%, white)",
    text: "#fff",
  },
  { label: "Compraram", value: 428, width: 44, tone: "var(--accent-600)", text: "#fff" },
] as const;

export function FunnelSection() {
  const reduced = useReducedMotion();
  const rates = ["92% inscreveram-se", "69% assistiram", "39% clicaram", "26% compraram"];
  return (
    <section data-surface="warm" className="site-section">
      <div className="site-wrap grid items-center gap-12 lg:grid-cols-[5fr_7fr] lg:gap-16">
        <div>
          <Reveal>
            <Kicker>Métricas</Kicker>
            <TwoTone
              light="Veja como o webinar rende,"
              bold="da inscrição à venda"
              className="max-w-[16ch]"
            />
            <p className="mt-5 max-w-[48ch] text-site-lead text-s-text-2">
              O funil inteiro num só painel: visitantes, inscrições, presença, retenção minuto a
              minuto, cliques na oferta, replay e compras.
            </p>
          </Reveal>
          <Stagger as="ul" className="mt-7 grid gap-3" gap={0.1} delay={0.2}>
            {[
              "Inscrição, presença ao vivo e no replay, em cada sessão.",
              "Retenção minuto a minuto, para encontrar o ponto exacto em que as pessoas saem.",
              "Quem ficou até à oferta, quem clicou e quem comprou.",
              "As vendas aprovadas das plataformas de checkout, direto nas métricas.",
            ].map((line) => (
              <Item key={line} as="li" distance={12}>
                <CheckLine>{line}</CheckLine>
              </Item>
            ))}
          </Stagger>
          <Reveal delay={0.4}>
            <Link
              to="/funcionalidades/$slug"
              params={{ slug: "analise" }}
              className="site-btn site-btn-primary mt-8"
            >
              Saber mais sobre a análise
            </Link>
          </Reveal>
        </div>
        <Reveal distance={32} delay={0.1}>
          <div className="rounded-[var(--radius-panel)] bg-white p-5 shadow-[0_24px_48px_-28px_rgba(37,17,10,.25)] sm:p-8">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="vt-funnel">
                {FUNNEL.map((step, i) => (
                  <motion.div
                    key={step.label}
                    className="vt-step"
                    style={{ width: `${step.width}%`, background: step.tone, color: step.text }}
                    initial={{ scaleX: reduced ? 1 : 0.2, opacity: reduced ? 1 : 0 }}
                    whileInView={{ scaleX: 1, opacity: 1 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.7, ease: EASE, delay: i * 0.12 }}
                  >
                    <span className="text-[13px] font-medium opacity-90">{step.label}</span>
                    <span className="text-[20px] font-semibold tabular-nums leading-tight">
                      <CountUp to={step.value} duration={1.4} delay={i * 0.12} />
                    </span>
                  </motion.div>
                ))}
              </div>
              <ul
                className="hidden content-start gap-[62px] self-start pt-[69px] sm:grid"
                aria-hidden="true"
              >
                {rates.map((rate, i) => (
                  <motion.li
                    key={rate}
                    className="whitespace-nowrap text-[13px] font-semibold text-[var(--accent-700)]"
                    initial={{ opacity: 0, x: reduced ? 0 : -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.5 + i * 0.12 }}
                  >
                    {rate}
                  </motion.li>
                ))}
              </ul>
            </div>
            <p className="mt-5 text-center text-[12px] text-s-text-2">
              Funil de uma sessão de demonstração (números fictícios).
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------- Chamada final ---------- */

export function FinalCta({ children }: { children: ReactNode }) {
  return (
    <section data-surface="accent" className="site-section">
      <div className="site-wrap grid items-center gap-10 rounded-[var(--radius-panel)] lg:grid-cols-[2fr_3fr] lg:gap-16">
        <Reveal className="text-center lg:text-left">
          <p className="text-[clamp(5rem,14vw,11rem)] font-semibold leading-none tracking-[-.04em]">
            0€
          </p>
          <p className="mt-2 text-[15px] font-bold uppercase tracking-[.2em]">para começar</p>
        </Reveal>
        <div>
          <Reveal delay={0.1}>
            <TwoTone
              light="Crie a conta e abra"
              bold="a primeira sala hoje"
              className="max-w-[18ch]"
            />
            <p className="mt-5 max-w-[52ch] text-site-lead text-s-text-2">
              Carregue o vídeo, marque o horário e veja a sala a funcionar com o chat, a oferta e os
              avisos de venda. A conta fica pronta em minutos.
            </p>
          </Reveal>
          <Stagger as="ul" className="mt-6 grid gap-2 sm:grid-cols-2" gap={0.08} delay={0.2}>
            {[
              "Sala de teste antes de abrir ao público",
              "Automações por WhatsApp e e-mail",
              "Agente IA no chat e no atendimento",
              "Métricas de cada sessão",
            ].map((line) => (
              <Item
                key={line}
                as="li"
                distance={10}
                className="flex items-center gap-2 text-site-body"
              >
                <Check className="size-4 flex-none" strokeWidth={2.5} aria-hidden="true" /> {line}
              </Item>
            ))}
          </Stagger>
          <Reveal delay={0.3} className="mt-8 max-w-[34rem]">
            {children}
          </Reveal>
        </div>
      </div>
    </section>
  );
}
