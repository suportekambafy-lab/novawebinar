/**
 * A vitrine do hero: uma fila de cartões escuros, cada um a contar em ciclo uma coisa que a sala faz
 * (a sessão a abrir, o replay a correr, as vendas a entrar, o teste A/B a decidir). O movimento é CSS
 * (styles.css, «vt-»); aqui só a estrutura, os textos e o carrossel (setas, pontos e avanço sozinho).
 * As fotos são capturas reais do produto (landing/shots.tsx) com uma conta fictícia.
 */
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock,
  Headset,
  LineChart,
  MessageSquareText,
  RotateCcw,
  Shuffle,
  Smartphone,
  Sparkles,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "motion/react";
import salaAoVivo from "@/assets/landing/sala-ao-vivo.webp";
import salaAoVivoTelemovel from "@/assets/landing/sala-ao-vivo-telemovel.webp";
import salaReplay from "@/assets/landing/sala-replay.webp";
import salaVendas from "@/assets/landing/sala-vendas.webp";
import { CountUp } from "@/components/landing/motion";

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <article className="vt-card" aria-label={title}>
      <div className="vt-head">
        <span aria-hidden="true">{icon}</span>
        {title}
      </div>
      {children}
    </article>
  );
}

/** Just in time: a pessoa preenche, carrega, e a sessão abre nesse instante. */
function JustInTime() {
  return (
    <Card icon={<Clock />} title="Just in time">
      <div className="vt-body">
        <div className="vt-a relative">
          <svg
            className="vt-cursor"
            style={{ right: "2.2rem", bottom: "1.1rem" }}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              d="M5 3l14 8-6 2-3 6z"
              fill="#fff"
              stroke="#000"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
          <div className="vt-panel flex flex-col gap-2">
            <span className="vt-chip is-light w-fit bg-[var(--accent-50)] text-[var(--accent-700)]">
              <i className="vt-dot is-pulse" /> Próxima sessão: agora
            </span>
            <p className="text-[13px] font-semibold leading-snug">
              Como vender todos os dias com aulas ao vivo
            </p>
            <div className="vt-field">Hoje · 20:30</div>
            <div className="vt-field">Maria Sousa</div>
            <div className="vt-field">maria@exemplo.com</div>
            <div className="vt-btn vt-press">Entrar na sala</div>
          </div>
        </div>
        <div
          className="vt-b absolute inset-x-0 bottom-0 overflow-hidden rounded-[14px]"
          style={{ height: 300 }}
        >
          <img src={salaAoVivo} alt="" className="vt-photo" loading="lazy" decoding="async" />
          <div className="vt-shade" />
          <div className="absolute left-3 top-3 flex items-center gap-2">
            <span className="vt-chip is-live">
              <i className="vt-dot is-pulse" /> AO VIVO
            </span>
            <span className="vt-chip">1.465 a assistir</span>
          </div>
          <div className="absolute inset-x-3 bottom-3">
            <p className="text-[13px] font-semibold">Como vender todos os dias com aulas ao vivo</p>
            <p className="vt-caption">Maria entrou na sala</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Replay: a gravação com a sala inteira, e as vendas que ainda entram depois. */
function Replay() {
  return (
    <Card icon={<RotateCcw />} title="Replay">
      <img src={salaReplay} alt="" className="vt-photo is-zoom" loading="lazy" decoding="async" />
      <div className="vt-shade" />
      <div className="vt-body">
        <div className="vt-panel flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold">Modo replay</p>
              <p className="vt-muted text-[12px]">A sala inteira: chat, oferta e avisos</p>
            </div>
            <span className="lp-switch-on is-on relative inline-block h-5 w-9 rounded-full after:absolute after:top-[.15rem] after:size-4 after:rounded-full after:bg-white after:content-['']" />
          </div>
          <div className="flex items-center gap-2">
            <span className="grid size-6 flex-none place-items-center rounded-full bg-[var(--accent-600)] text-white">
              <svg viewBox="0 0 24 24" className="size-3 fill-current" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            <div className="vt-bar flex-1">
              <em />
            </div>
            <span className="vt-muted text-[12px] tabular-nums">00:32 / 58:10</span>
          </div>
          <p className="text-[13px] font-semibold text-[#15803d]">
            43% das vendas chegam no replay
          </p>
        </div>
      </div>
    </Card>
  );
}

/** Métricas: quem está na sala agora, a receita e o gráfico a desenhar-se. */
function Metrics() {
  return (
    <Card icon={<LineChart />} title="Métricas de cada sessão">
      <div className="vt-body justify-start pt-1">
        <span className="vt-chip is-light ml-auto">
          <i className="vt-dot is-pulse text-[var(--accent-600)]" /> <b>1.261</b> ao vivo agora
        </span>
        <div className="vt-panel is-dark mt-auto flex flex-col gap-2">
          <p className="text-[12px] text-white/70">Receita do webinar</p>
          <p className="text-[26px] font-semibold leading-none tabular-nums">
            <CountUp to={66864} duration={2} /> €
          </p>
          <p className="text-[13px] font-semibold text-[#4ade80]">↑ 21% de conversão</p>
          <svg viewBox="0 0 260 70" className="mt-1 w-full" aria-hidden="true">
            <defs>
              <linearGradient id="vt-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--accent-600)" stopOpacity=".45" />
                <stop offset="1" stopColor="var(--accent-600)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              className="vt-fade-in"
              style={{ "--i": 6 } as React.CSSProperties}
              d="M0 60 L30 52 L60 56 L90 40 L120 44 L150 30 L180 34 L210 18 L240 22 L260 8 L260 70 L0 70 Z"
              fill="url(#vt-area)"
            />
            <path
              className="vt-trace"
              d="M0 60 L30 52 L60 56 L90 40 L120 44 L150 30 L180 34 L210 18 L240 22 L260 8"
              fill="none"
              stroke="var(--accent-600)"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
          </svg>
          <div className="grid grid-cols-3 gap-2 text-[12px]">
            {[
              ["Inscritos", "1.724"],
              ["Assistiram", "1.465"],
              ["Compras", "18"],
            ].map(([k, v], i) => (
              <div key={k} className="vt-fade-in" style={{ "--i": i + 2 } as React.CSSProperties}>
                <p className="text-white/60">{k}</p>
                <p className="text-[15px] font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Avisos de venda: as compras reais a aparecer na sala, uma de cada vez. */
function Notifications() {
  const sales = [
    ["Compra confirmada!", "Maria comprou o curso"],
    ["Compra confirmada!", "João comprou o curso"],
    ["Compra confirmada!", "Carla comprou o curso"],
  ];
  return (
    <Card icon={<Bell />} title="Avisos de venda">
      <img src={salaVendas} alt="" className="vt-photo is-zoom" loading="lazy" decoding="async" />
      <div className="vt-shade" />
      {sales.map(([title, who], i) => (
        <div
          key={who}
          className="vt-notif vt-panel flex items-center gap-3"
          style={{ "--i": i } as React.CSSProperties}
        >
          <span className="grid size-7 flex-none place-items-center rounded-md bg-[#16a34a] text-white">
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <div>
            <p className="text-[13px] font-semibold leading-tight">{title}</p>
            <p className="vt-muted text-[12px]">{who}</p>
          </div>
        </div>
      ))}
    </Card>
  );
}

/** Teste A/B: as pessoas a entrar, as variantes a competir e a vencedora a ficar. */
function AbTest() {
  const faces = ["AM", "JS", "CL", "RP", "TF", "LB"];
  const bars = [
    ["A", "Oferta padrão", 14],
    ["B", "Bónus no pitch", 17],
    ["C", "Parcelado", 19],
    ["D", "Bónus + parcelado", 24],
  ] as const;
  return (
    <Card icon={<Shuffle />} title="Teste A/B">
      <div className="vt-body justify-start pt-2">
        <div className="vt-panel flex flex-col items-center gap-1 text-center">
          <div className="flex -space-x-2">
            {faces.map((f, i) => (
              <span
                key={f}
                className="vt-face grid size-8 place-items-center rounded-full border-2 border-white bg-[var(--accent-100)] text-[11px] font-semibold text-[var(--accent-700)]"
                style={{ "--i": i } as React.CSSProperties}
              >
                {f}
              </span>
            ))}
          </div>
          <p className="text-[14px] font-semibold tabular-nums">1.254 participantes</p>
          <p className="flex items-center gap-1 text-[12px] text-[#15803d]">
            <i className="vt-dot is-green" /> a entrar na sala agora
          </p>
        </div>
        <div className="mt-auto grid grid-cols-4 gap-2">
          {bars.map(([label, name, pct], i) => (
            <div
              key={label}
              className={`flex flex-col items-center rounded-lg px-1 pb-2 pt-3 text-center ${label === "D" ? "vt-win border border-[#4ade80] bg-[#16a34a]/25" : "bg-white/8"}`}
            >
              {label === "D" && (
                <span className="-mt-5 mb-1 rounded-full bg-[#16a34a] px-2 py-px text-[10px] font-bold uppercase tracking-wide">
                  Vencedora
                </span>
              )}
              <div className="flex h-9 items-end">
                <i
                  className="vt-grow block w-5"
                  style={
                    {
                      "--pct": `${pct * 4}%`,
                      "--i": i,
                      background: label === "D" ? "#4ade80" : undefined,
                    } as React.CSSProperties
                  }
                />
              </div>
              <b className="mt-1 text-[13px]">{label}</b>
              <span className="text-[10px] leading-tight text-white/60">{name}</span>
              <span
                className={`mt-1 text-[13px] font-semibold tabular-nums ${label === "D" ? "text-[#4ade80]" : ""}`}
              >
                {pct}%
              </span>
            </div>
          ))}
        </div>
        <p className="vt-caption">A sala D converte mais. Fica; as outras saem.</p>
      </div>
    </Card>
  );
}

/** O Agente IA no chat: pergunta, «a escrever», resposta, em três diálogos que se revezam. */
function AiChat() {
  const dialogs = [
    [
      "Tem certificado?",
      "Sim! Ao concluir 80% das aulas, emites o certificado na tua área de aluno.",
    ],
    [
      "Dá para pagar em prestações?",
      "Dá: até 12x no cartão. O link da oferta já abre com essa opção.",
    ],
    [
      "E se eu perder a aula de hoje?",
      "Fica a gravação disponível por 48 h. Envio-te o link assim que acabar.",
    ],
  ];
  return (
    <Card icon={<Sparkles />} title="Agente IA no chat">
      {dialogs.map(([q, a], i) => (
        <div key={q} className="vt-dialog" style={{ "--i": i } as React.CSSProperties}>
          <div className="vt-q self-end rounded-2xl rounded-br-sm bg-white/12 px-3 py-2 text-[13px]">
            <span className="block text-[11px] text-white/60">Aluno</span>
            {q}
          </div>
          <div className="vt-typing self-start rounded-2xl rounded-bl-sm bg-[var(--accent-600)]/25 px-3 py-2 text-white/80">
            <i style={{ "--j": 0 } as React.CSSProperties} />
            <i style={{ "--j": 1 } as React.CSSProperties} />
            <i style={{ "--j": 2 } as React.CSSProperties} />
          </div>
          <div className="vt-answer self-start rounded-2xl rounded-bl-sm bg-[var(--accent-600)] px-3 py-2 text-[13px]">
            <span className="block text-[11px] text-white/75">
              Agente · responde pelo conteúdo da aula
            </span>
            {a}
          </div>
        </div>
      ))}
    </Card>
  );
}

/** Atendimento: um pedido a chegar à equipa, por urgência, com quem está disponível. */
function Support() {
  return (
    <Card icon={<Headset />} title="Atendimento ao vivo">
      <div className="vt-body">
        <div
          className="vt-msg vt-panel is-dark flex items-center gap-3"
          style={{ "--i": 0 } as React.CSSProperties}
        >
          <span className="grid size-8 flex-none place-items-center rounded-full bg-white/15 text-[12px] font-semibold">
            RA
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">Rui Almeida</p>
            <p className="truncate text-[12px] text-white/65">Já tenho um negócio, isto serve?</p>
          </div>
          <span className="text-[11px] text-white/55">há 2 min</span>
        </div>
        <div
          className="vt-msg vt-panel flex items-center gap-3"
          style={{ "--i": 1 } as React.CSSProperties}
        >
          <span className="vt-ring grid size-8 flex-none place-items-center rounded-full bg-[var(--accent-600)] text-[12px] font-semibold text-white">
            LC
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">Luciana Costa</p>
            <p className="truncate text-[12px] text-[#b45309]">Quero comprar, como pago?</p>
          </div>
          <span className="vt-btn h-8 px-3">Atender</span>
        </div>
        <p
          className="vt-msg flex items-center gap-2 text-[12px] text-white/75"
          style={{ "--i": 2 } as React.CSSProperties}
        >
          <i className="vt-dot is-green" /> 3 atendentes online · vendas primeiro
        </p>
      </div>
    </Card>
  );
}

/** Automações: as mensagens que saem sozinhas, por WhatsApp e e-mail, e param quando a pessoa compra. */
function Automations() {
  const messages = [
    ["20:15", "Faltam 15 min para a aula 🎥 Entra por aqui:", "novawebinar.com/w/aula"],
    ["20:30", "Começou! A Maria já está a apresentar.", null],
    ["22:10", "A gravação já está disponível por 48 h.", "novawebinar.com/w/aula?replay=1"],
  ];
  return (
    <Card icon={<MessageSquareText />} title="Automações">
      <div className="vt-body">
        {messages.map(([at, text, link], i) => (
          <div
            key={at}
            className="vt-msg max-w-[88%] self-start rounded-2xl rounded-bl-sm bg-[#1f3b2d] px-3 py-2 text-[13px] text-white shadow-[0_8px_24px_-12px_rgba(0,0,0,.6)]"
            style={{ "--i": i } as React.CSSProperties}
          >
            {text}
            {link && (
              <span className="mt-1 block text-[12px] text-[#86efac] underline">{link}</span>
            )}
            <span className="mt-1 block text-right text-[10px] text-white/55">{at} ✓✓</span>
          </div>
        ))}
        <div
          className="vt-msg vt-panel flex items-center gap-2 text-[12px]"
          style={{ "--i": 3 } as React.CSSProperties}
        >
          <span className="grid size-6 flex-none place-items-center rounded-full bg-[#16a34a] text-white">
            <svg
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              aria-hidden="true"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
          <span>
            <b>Compra aprovada.</b>{" "}
            <span className="vt-muted">As mensagens de venda param aqui.</span>
          </span>
        </div>
      </div>
    </Card>
  );
}

/** Formato Live: o vídeo ao alto a encher o telemóvel, com o chat por cima. */
function LivePhone() {
  return (
    <Card icon={<Smartphone />} title="Formato Live">
      <div className="absolute inset-x-0 top-14 flex justify-center">
        <figure className="site-phone w-[62%]" style={{ padding: 5, borderRadius: 26 }}>
          <img
            src={salaAoVivoTelemovel}
            alt=""
            width={600}
            height={1301}
            loading="lazy"
            decoding="async"
            style={{ borderRadius: 21 }}
          />
        </figure>
      </div>
      <span
        className="vt-float vt-chip is-light absolute left-3 top-24"
        style={{ "--i": 0 } as React.CSSProperties}
      >
        <i className="vt-dot text-[var(--accent-600)]" /> Vídeo 9:16
      </span>
      <span
        className="vt-float vt-chip is-light absolute right-3 top-48"
        style={{ "--i": 2 } as React.CSSProperties}
      >
        Chat por cima
      </span>
      <span
        className="vt-float vt-chip is-light absolute bottom-16 left-4"
        style={{ "--i": 4 } as React.CSSProperties}
      >
        Oferta sem sair da aula
      </span>
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0b0b0b] to-transparent" />
      <p className="vt-caption absolute inset-x-4 bottom-4">
        Como uma live de rede social, mas gravada.
      </p>
    </Card>
  );
}

/** Biblioteca: os vídeos alojados por nós, a chegar e a ficar prontos. */
function Library() {
  const rows = [
    ["Aula completa", "1,2 GB", "pronto"],
    ["Masterclass · 9:16", "2,1 GB", "pronto"],
    ["Bónus de abertura", "640 MB", "a enviar"],
  ] as const;
  return (
    <Card icon={<Upload />} title="Biblioteca de vídeos">
      <div className="vt-body justify-start pt-2">
        <div className="vt-panel flex flex-col gap-2">
          {rows.map(([name, size, state], i) => (
            <div
              key={name}
              className="vt-fade-in flex items-center gap-3 rounded-lg bg-[var(--ds-gray-100)] px-3 py-2"
              style={{ "--i": i } as React.CSSProperties}
            >
              <span className="grid size-8 flex-none place-items-center rounded-md bg-[var(--accent-600)] text-white">
                <svg viewBox="0 0 24 24" className="size-3.5 fill-current" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold">{name}</p>
                <p className="vt-muted text-[12px]">{size}</p>
              </div>
              {state === "pronto" ? (
                <span className="text-[12px] font-semibold text-[#15803d]">Pronto</span>
              ) : (
                <div className="w-14">
                  <div className="vt-bar">
                    <em />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="vt-caption mt-2">
          Alojamento incluído. Toca em qualquer rede, do início ou no minuto certo.
        </p>
      </div>
    </Card>
  );
}

const CARDS = [
  JustInTime,
  Replay,
  Metrics,
  Notifications,
  AbTest,
  AiChat,
  Support,
  Automations,
  LivePhone,
  Library,
];

/**
 * A fila: desliza com o dedo e encaixa; no computador, as setas e os pontos. Avança sozinha de 4 em 4 s e
 * pára ao passar o rato, ao tocar ou com «reduzir movimento».
 */
export function Vitrine() {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();
  const count = CARDS.length;

  const go = (next: number) => {
    const el = track.current;
    if (!el) return;
    const i = ((next % count) + count) % count;
    const card = el.children[i] as HTMLElement | undefined;
    if (card)
      el.scrollTo({
        left: card.offsetLeft - parseFloat(getComputedStyle(el).paddingLeft),
        behavior: "smooth",
      });
  };

  // O cartão mais visível é o activo (pelo scroll, para o dedo e as setas ficarem na mesma conta).
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      const left = el.scrollLeft + parseFloat(getComputedStyle(el).paddingLeft);
      let best = 0;
      let distance = Infinity;
      for (let i = 0; i < el.children.length; i += 1) {
        const d = Math.abs((el.children[i] as HTMLElement).offsetLeft - left);
        if (d < distance) {
          distance = d;
          best = i;
        }
      }
      setIndex(best);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (paused || reduced) return;
    const timer = window.setInterval(() => go(index + 1), 4000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused, reduced]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        ref={track}
        className="vt-track"
        aria-roledescription="carrossel"
        aria-label="O que a sala faz"
      >
        {CARDS.map((Item, i) => (
          <Item key={i} />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-center gap-5">
        <button
          type="button"
          className="vt-ctrl"
          onClick={() => go(index - 1)}
          aria-label="Anterior"
        >
          <ChevronLeft />
        </button>
        <div className="vt-dots" role="tablist" aria-label="Cartões">
          {CARDS.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Cartão ${i + 1}`}
              onClick={() => go(i)}
            />
          ))}
        </div>
        <button
          type="button"
          className="vt-ctrl"
          onClick={() => go(index + 1)}
          aria-label="Seguinte"
        >
          <ChevronRight />
        </button>
      </div>
    </div>
  );
}
