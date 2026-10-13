/**
 * Os visuais do produto no site público: uma sala, um editor, um painel, desenhados em HTML (sem
 * capturas de ecrã) e a acontecer: a contagem de pessoas sobe, as mensagens chegam, a compra entra,
 * o gráfico desenha-se. Cada história corre uma vez quando o visual chega ao ecrã (e, na sala,
 * repete-se devagar), sem som e sem depender do rato. Com «reduzir movimento», tudo aparece já feito.
 */
import {
  BarChart3,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Eye,
  Headphones,
  MessageCircle,
  MoreHorizontal,
  Radio,
  Repeat2,
  Send,
  ShoppingCart,
  Sparkles,
  Video,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import presenter480 from "@/assets/local/nova-presenter-480.webp";
import presenter720 from "@/assets/local/nova-presenter-720.webp";
import { CountUp, DrawPath, EASE, useStory } from "./motion";

/** A foto da sala: WebP com tamanho fixo e lazy (18 KB ou 28 KB, conforme o ecrã). */
function Presenter() {
  return (
    <img
      src={presenter480}
      srcSet={`${presenter480} 480w, ${presenter720} 720w`}
      sizes="(min-width: 1024px) 40vw, 80vw"
      width={720}
      height={480}
      loading="lazy"
      decoding="async"
      alt="Pessoa a fazer uma apresentação num ambiente profissional"
    />
  );
}

/** Uma linha do chat que entra de baixo quando lhe chega a vez (ou já está, antes da vez, se `still`). */
function ChatLine({
  shown,
  initials,
  alt = false,
  name,
  text,
  at,
}: {
  shown: boolean;
  initials: string;
  alt?: boolean;
  name: string;
  text: string;
  at: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className="lp-chat-line"
      initial={false}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : 10 }}
      transition={{ duration: 0.45, ease: EASE }}
      aria-hidden={!shown}
    >
      <span className={`lp-avatar${alt ? " is-alt" : ""}`}>{initials}</span>
      <div>
        <strong>{name}</strong>
        <p>{text}</p>
      </div>
      <small>{at}</small>
    </motion.div>
  );
}

/** O aviso de compra: salta para dentro, com um pequeno ressalto, e some com suavidade. */
function PurchasePop({ shown, className, children }: { shown: boolean; className: string; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          className={className}
          initial={{ opacity: 0, y: reduced ? 0 : 14, scale: reduced ? 1 : 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: reduced ? 0 : -8, transition: { duration: 0.35 } }}
          transition={{ type: "spring", stiffness: 420, damping: 26 }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** «Ao vivo» a pulsar devagar, como o ponto vermelho de uma transmissão. */
function LiveTag() {
  const reduced = useReducedMotion();
  return (
    <b className="lp-live-tag">
      <motion.span
        className="inline-flex"
        animate={reduced ? {} : { opacity: [1, 0.35, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <Radio />
      </motion.span>{" "}
      Ao Vivo
    </b>
  );
}

const SCHEDULE_STEPS = [500, 1100, 1700, 2400] as const;

export function ScheduleVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const done = useStory(ref, SCHEDULE_STEPS);
  const reduced = useReducedMotion();
  const fields = [
    { icon: Repeat2, label: "Quando", value: "Diário" },
    { icon: Clock3, label: "Hora de início", value: "20:00" },
    { icon: Clock3, label: "Hora de fim", value: "21:15" },
    { icon: CalendarDays, label: "Fuso horário", value: "Lisboa" },
  ];
  return (
    <div ref={ref} className="lp-product-frame" aria-label="Demonstração da configuração de uma sessão recorrente">
      <div className="lp-editor-rail" aria-hidden="true"><b>N</b><span className="is-active"><CalendarDays /></span><span><Video /></span><span><MessageCircle /></span><span><Sparkles /></span><span><BarChart3 /></span></div>
      <div className="lp-product-ui lp-schedule-ui">
        <div className="lp-ui-header"><div><span>LIVE · DEMONSTRAÇÃO</span><strong>Configuração da sessão</strong></div><MoreHorizontal /></div>
        <div className="lp-mode-switch"><span className="is-active">Sessão única</span><span>Just in time</span></div>
        <div className="lp-switch-row">
          <div><strong>Ativar repetição automática</strong><small>Uma sessão por dia ou por semana.</small></div>
          {/* O interruptor liga-se à nossa frente: o botão desliza da esquerda para a direita. */}
          <span className={`lp-switch-on${done >= 1 ? " is-on" : ""}`} aria-hidden="true" />
        </div>
        <div className="lp-form-grid is-four">
          {fields.map(({ icon: Icon, label, value }, index) => (
            <motion.div
              key={label}
              initial={false}
              animate={done >= 2 ? { opacity: 1, y: 0 } : { opacity: 0.35, y: reduced ? 0 : 6 }}
              transition={{ duration: 0.4, ease: EASE, delay: index * 0.08 }}
            >
              <Icon /><span>{label}</span><strong>{value}</strong>
            </motion.div>
          ))}
        </div>
        <div className="lp-ui-footer">
          <motion.span initial={false} animate={{ opacity: done >= 3 ? 1 : 0 }} transition={{ duration: 0.4 }}>
            <Check /> Próxima sessão preparada
          </motion.span>
          <motion.span
            className="lp-faux-button"
            initial={false}
            animate={done >= 4 && !reduced ? { scale: [1, 0.96, 1] } : { scale: 1 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            {done >= 4 ? "Guardado" : "Guardar alterações"}
          </motion.span>
        </div>
      </div>
    </div>
  );
}

/** As mensagens e a compra entram uma a uma; depois de uma pausa, a cena repete-se. */
const ROOM_STEPS = [400, 1500, 2700, 3900] as const;
const SALES_STEPS = [400, 1300, 2600, 3500, 4700] as const;

export function RoomVisual({ sales = false }: { sales?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const done = useStory(ref, sales ? SALES_STEPS : ROOM_STEPS, 11000);
  return (
    <div ref={ref} className="lp-room-ui" aria-label={sales ? "Sala ao vivo com notificações de venda" : "Sala ao vivo do Novawebinar"}>
      <div className="lp-room-player">
        <Presenter />
        <div className="lp-room-top">
          <span className="lp-live-group">
            <LiveTag />
            <b className="lp-live-count"><Eye /> <CountUp from={1193} to={1284} duration={2.4} /></b>
          </span>
        </div>
        {sales ? (
          <PurchasePop shown={done >= 2 && done < 5} className="lp-purchase-toast">
            <span><ShoppingCart /></span><p><strong>João Pereira</strong> comprou Viver de Leilão</p>
          </PurchasePop>
        ) : null}
      </div>
      <div className="lp-room-side">
        <div className="lp-room-tabs"><strong>Chat</strong><span>Suporte</span><span>Oferta</span></div>
        {sales ? (
          <>
            <ChatLine shown={done >= 1} initials="RM" name="Ricardo M." text="Quero comprar, como faço?" at="21:02" />
            <PurchasePop shown={done >= 2} className="lp-chat-purchase">
              <span><ShoppingCart /></span><p><strong>João Pereira</strong> comprou Viver de Leilão</p>
            </PurchasePop>
            <ChatLine shown={done >= 3} initials="MS" alt name="Marta S." text="Já faturei 4 mil com o método" at="21:03" />
            <PurchasePop shown={done >= 4} className="lp-chat-purchase">
              <span><ShoppingCart /></span><p><strong>Inês Carvalho</strong> comprou Viver de Leilão</p>
            </PurchasePop>
            <div className="lp-message-field"><span>Escrever uma mensagem</span><Send /></div>
          </>
        ) : (
          <>
            <ChatLine shown={done >= 1} initials="AS" name="Ana Sofia" text="Boa noite! A entrar agora, de Braga" at="20:58" />
            <ChatLine shown={done >= 2} initials="RM" alt name="Ricardo M." text="Quero comprar, onde clico?" at="21:01" />
            <ChatLine shown={done >= 3} initials="MS" name="Marta S." text="Já faturei 4 mil com o método" at="21:03" />
            <div className="lp-message-field">
              <TypedText shown={done >= 4} text="Obrigada Marta, inspira-nos!" placeholder="Escrever uma mensagem" />
              <Send />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Um texto a ser escrito letra a letra no campo de mensagem. */
function TypedText({ shown, text, placeholder }: { shown: boolean; text: string; placeholder: string }) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!shown) {
      setCount(0);
      return;
    }
    if (reduced) {
      setCount(text.length);
      return;
    }
    let n = 0;
    const timer = window.setInterval(() => {
      n += 1;
      setCount(n);
      if (n >= text.length) window.clearInterval(timer);
    }, 45);
    return () => window.clearInterval(timer);
  }, [shown, reduced, text]);
  return <span style={count > 0 ? { color: "var(--lp-ink)" } : undefined}>{count > 0 ? text.slice(0, count) : placeholder}</span>;
}

export function ReplayVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const done = useStory(ref, ROOM_STEPS);
  const reduced = useReducedMotion();
  return (
    <div ref={ref} className="lp-room-ui" aria-label="Sala em modo replay do Novawebinar">
      <div className="lp-room-player">
        <Presenter />
        <div className="lp-room-top">
          <span className="lp-live-group"><b className="lp-replay-tag"><Video /> Replay</b><b className="lp-live-count"><Eye /> 312</b></span>
        </div>
        <div className="lp-replay-bar">
          <span className="lp-replay-track">
            <motion.span
              initial={{ width: reduced ? "56%" : "38%" }}
              whileInView={{ width: "56%" }}
              viewport={{ once: true }}
              transition={{ duration: 6, ease: "linear" }}
              style={{ display: "block", height: "100%" }}
            />
          </span>
          <small>32:14 / 58:00</small>
        </div>
      </div>
      <div className="lp-room-side">
        <div className="lp-room-tabs"><strong>Chat</strong><span>Suporte</span><span>Oferta</span></div>
        <ChatLine shown={done >= 1} initials="AS" name="Ana Sofia" text="Boa noite! A entrar agora, de Braga" at="20:58" />
        <ChatLine shown={done >= 2} initials="RM" alt name="Ricardo M." text="Quero comprar, onde clico?" at="21:01" />
        <ChatLine shown={done >= 3} initials="MS" name="Marta S." text="Já faturei 4 mil com o método" at="21:03" />
        <div className="lp-message-field"><span>Escrever uma mensagem</span><Send /></div>
      </div>
    </div>
  );
}

const ASSIST_STEPS = [500, 1400, 2900] as const;

export function AssistanceVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const done = useStory(ref, ASSIST_STEPS);
  const reduced = useReducedMotion();
  return (
    <div ref={ref} className="lp-product-ui lp-assistance-ui" aria-label="Demonstração da configuração do Assistente IA">
      <div className="lp-ui-header"><div><span>AGENTE IA · DEMONSTRAÇÃO</span><strong>Assistência no suporte privado</strong></div><Bot /></div>
      <div className="lp-ai-status">
        <span>
          <motion.span
            animate={reduced ? {} : { scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          />{" "}
          Assistente IA ativo
        </span>
        <small>Identificado como assistente</small>
      </div>
      <div className="lp-ai-grid"><div><Headphones /><span>Conhecimento</span><strong>Conteúdo da live</strong></div><div><MessageCircle /><span>Respostas</span><strong>FAQs e objeções</strong></div></div>
      <div className="lp-ai-reply">
        <span>PARTICIPANTE · SUPORTE</span>
        <motion.p initial={false} animate={{ opacity: done >= 1 ? 1 : 0, y: done >= 1 || reduced ? 0 : 6 }} transition={{ duration: 0.4, ease: EASE }}>
          Onde posso rever esta parte?
        </motion.p>
        <motion.div initial={false} animate={{ opacity: done >= 2 ? 1 : 0, y: done >= 2 || reduced ? 0 : 6 }} transition={{ duration: 0.4, ease: EASE }}>
          <Bot />
          {done >= 3 ? (
            <p>Posso ajudar com base no conteúdo já apresentado. Se necessário, encaminho para a equipa.</p>
          ) : (
            <p className="lp-typing" aria-label="A escrever"><i /><i /><i /></p>
          )}
        </motion.div>
      </div>
      <small className="lp-safety-note">A equipa pode pausar o assistente em cada conversa.</small>
    </div>
  );
}

const CHART_LINE = "M0 190 C90 180 120 68 205 76 S310 105 390 92 S510 126 575 130 S650 150 720 168";

export function DashboardVisual() {
  const reduced = useReducedMotion();
  return (
    <div className="lp-dashboard-ui" aria-label="Pré-visualização ilustrativa do painel de acompanhamento">
      <div className="lp-dashboard-head"><div><span>VISÃO GERAL</span><strong>Acompanhamento da live</strong></div><span className="lp-filter-demo">Últimos 30 dias <ChevronDown /></span></div>
      <div className="lp-stat-row">
        <div><span>Inscritos</span><strong>—</strong><small>Dados reais da sua sessão</small></div>
        <div><span>Assistiram</span><strong>—</strong><small>Ao vivo e replay</small></div>
        <div><span>Tempo médio</span><strong>—</strong><small>Retenção acompanhada</small></div>
      </div>
      <div className="lp-chart-area">
        <div className="lp-chart-labels"><span>Participação ao longo da sessão</span><span>Pré-visualização</span></div>
        <svg viewBox="0 0 720 220" role="img" aria-label="Exemplo ilustrativo de gráfico de retenção">
          <path className="lp-chart-gridline" d="M0 40H720M0 100H720M0 160H720M0 215H720" />
          {/* A área enche-se depois de a linha se desenhar. */}
          <motion.path
            className="lp-chart-fill"
            d={`${CHART_LINE} V220 H0Z`}
            initial={{ opacity: reduced ? 1 : 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.8, delay: 1.4 }}
          />
          <DrawPath className="lp-chart-line" d={CHART_LINE} duration={1.8} />
          {/* O ponto onde a atenção cai, a aparecer no fim. */}
          <motion.circle
            cx={205}
            cy={76}
            r={5}
            className="lp-chart-dot"
            initial={{ scale: reduced ? 1 : 0, opacity: reduced ? 1 : 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ delay: 1.9, type: "spring", stiffness: 380, damping: 18 }}
            style={{ transformOrigin: "205px 76px" }}
          />
        </svg>
      </div>
      <span className="lp-demo-caption">Pré-visualização ilustrativa — sem dados de clientes</span>
    </div>
  );
}

/** A contagem da oferta a descer de verdade, segundo a segundo, a partir de 14:59. */
function OfferCountdown() {
  const reduced = useReducedMotion();
  const [left, setLeft] = useState(14 * 60 + 59);
  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 14 * 60 + 59)), 1000);
    return () => window.clearInterval(timer);
  }, [reduced]);
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return (
    <strong>
      {mm}:{ss}
    </strong>
  );
}

export function OfferVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const done = useStory(ref, [500, 1100, 1700] as const);
  const reduced = useReducedMotion();
  return (
    <div ref={ref} className="lp-room-ui is-offer" aria-label="Oferta apresentada durante a sessão ao vivo">
      <div className="lp-room-player">
        <Presenter />
        <div className="lp-room-top">
          <span className="lp-live-group"><LiveTag /><b className="lp-live-count"><Eye /> <CountUp from={1193} to={1284} duration={2.4} /></b></span>
        </div>
      </div>
      <div className="lp-room-side">
        <div className="lp-room-tabs"><span>Chat</span><span>Suporte</span><strong>Oferta</strong></div>
        <div className="lp-offer-panel">
          <motion.div className="lp-offer-product" initial={false} animate={{ opacity: done >= 1 ? 1 : 0, y: done >= 1 || reduced ? 0 : 8 }} transition={{ duration: 0.4, ease: EASE }}>
            <span>OFERTA DA SESSÃO</span><strong>Viver de Leilão</strong>
          </motion.div>
          <motion.p className="lp-offer-prices" initial={false} animate={{ opacity: done >= 2 ? 1 : 0, y: done >= 2 || reduced ? 0 : 8 }} transition={{ duration: 0.4, ease: EASE }}>
            <s>De 497 €</s><strong>Por 197 €</strong>
          </motion.p>
          <motion.span
            className="lp-offer-cta"
            initial={false}
            animate={done >= 3 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: reduced ? 1 : 0.95 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
          >
            <ShoppingCart /> Quero garantir o meu lugar
          </motion.span>
          <div className="lp-offer-countdown"><span>Oferta termina em</span><OfferCountdown /></div>
        </div>
      </div>
    </div>
  );
}
