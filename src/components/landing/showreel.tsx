/**
 * A apresentação animada do hero: 56 segundos em seis cenas, feitos com as capturas reais do produto
 * (landing/shots.tsx, conta fictícia) e camadas animadas por cima. Não é um vídeo: um relógio único
 * (`t`, em segundos) conduz tudo por motion values, só com transform e opacity, por isso não há
 * renderizações do React a cada fotograma e as interfaces ficam nítidas em qualquer ecrã.
 *
 * O palco desenha-se num espaço fixo de 1600×900 e é escalado para a largura disponível. No telemóvel
 * os títulos saem do palco e ficam por baixo, legíveis. Pára fora do ecrã e com o separador escondido;
 * com movimento reduzido não arranca sozinha e mostra o fecho. O chat, a compra e os números são
 * demonstrativos e estão marcados como tal.
 */
import { Link } from "@tanstack/react-router";
import {
  Check,
  Pause,
  Play,
  Radio,
  ShoppingBag,
  UserPlus,
  Video,
  Mail,
  MessageCircle,
  RotateCcw,
} from "lucide-react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionStyle,
  type MotionValue,
} from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { SHOWREEL_PLAY_EVENT, ShowreelPoster } from "@/components/landing/showreel-poster";
import logo from "@/assets/brand/novawebinar-logo.png";
import painel from "@/assets/landing/painel.webp";
import editorAgenda from "@/assets/landing/editor-agenda.webp";
import editorOferta from "@/assets/landing/editor-oferta.webp";
import salaAoVivo from "@/assets/landing/sala-ao-vivo.webp";
import salaAoVivoTelemovel from "@/assets/landing/sala-ao-vivo-telemovel.webp";
import salaOferta from "@/assets/landing/sala-oferta.webp";
import salaVendasTelemovel from "@/assets/landing/sala-vendas-telemovel.webp";
import fluxo from "@/assets/landing/fluxo.webp";
import metricas from "@/assets/landing/metricas.webp";

const W = 1600;
const H = 900;
export const SHOWREEL_DURATION = 56;

/** As capturas têm 1600×1000; as coordenadas abaixo foram medidas numa cópia de 900 px de largura. */
const FW = 1180;
const IH = (FW * 1000) / 1600;
const px = (v: number) => (v * FW) / 900;

export const SCENES = [
  { start: 0, end: 6.6, label: "Início", title: "Transforma apresentações em resultados.", sub: "Cria. Automatiza. Apresenta. Escala." },
  { start: 6.6, end: 15, label: "Criar", title: "O teu próximo webinar começa aqui.", sub: "Agenda, chat e oferta preparados no editor." },
  { start: 15, end: 25, label: "Sala", title: "Uma experiência pensada para envolver.", sub: "Vídeo, chat e reacções no computador e no telemóvel." },
  { start: 25, end: 35, label: "Automação", title: "Automatiza o processo. Concentra-te no crescimento.", sub: "Da inscrição à oferta, com lembretes por e-mail e WhatsApp." },
  { start: 35, end: 45, label: "Conversão", title: "Da atenção à ação.", sub: "A oferta entra no minuto certo e as métricas mostram o resto." },
  { start: 45, end: SHOWREEL_DURATION, label: "NovaWebinar", title: "NovaWebinar. O palco do teu crescimento.", sub: "Começar agora" },
] as const;

const sceneAt = (v: number) => Math.max(0, SCENES.findIndex((s) => v >= s.start && v < s.end));

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/* ---------- Pistas: cada camada declara os seus instantes-chave ---------- */

type Track = {
  at: number[];
  o?: number[];
  x?: number[];
  y?: number[];
  s?: number[];
  rx?: number[];
  ry?: number[];
  b?: number[];
};

function useTrack(t: MotionValue<number>, tr: Track) {
  const fill = (v: number[] | undefined, d: number) => v ?? tr.at.map(() => d);
  const opts = { clamp: true, ease: easeInOut };
  const opacity = useTransform(t, tr.at, fill(tr.o, 1), opts);
  const x = useTransform(t, tr.at, fill(tr.x, 0), opts);
  const y = useTransform(t, tr.at, fill(tr.y, 0), opts);
  const scale = useTransform(t, tr.at, fill(tr.s, 1), opts);
  const rotateX = useTransform(t, tr.at, fill(tr.rx, 0), opts);
  const rotateY = useTransform(t, tr.at, fill(tr.ry, 0), opts);
  const blur = useTransform(t, tr.at, fill(tr.b, 0), opts);
  const filter = useTransform(blur, (b) => (b > 0.05 ? `blur(${b.toFixed(2)}px)` : "none"));
  const visibility = useTransform(opacity, (o) => (o < 0.005 ? "hidden" : "visible"));
  return { opacity, x, y, scale, rotateX, rotateY, filter, visibility };
}

function Layer({
  t,
  tr,
  className,
  style,
  children,
}: {
  t: MotionValue<number>;
  tr: Track;
  className?: string | undefined;
  style?: MotionStyle | undefined;
  children?: ReactNode;
}) {
  const motionStyle = useTrack(t, tr);
  return (
    <motion.div className={`absolute ${className ?? ""}`} style={{ ...style, ...motionStyle }}>
      {children}
    </motion.div>
  );
}

/** Opacidade de uma imagem que entra e sai (para trocar capturas dentro da mesma moldura). */
function Fade({ t, at, o, src, alt = "" }: { t: MotionValue<number>; at: number[]; o: number[]; src: string; alt?: string }) {
  const opacity = useTransform(t, at, o, { clamp: true });
  return (
    <motion.img
      src={src}
      alt={alt}
      width={1600}
      height={1000}
      decoding="async"
      draggable={false}
      className="absolute inset-0 size-full"
      style={{ opacity }}
    />
  );
}

/* ---------- Molduras ---------- */

function Browser({ width = FW, children, address = "app.novawebinar.com" }: { width?: number; children: ReactNode; address?: string }) {
  return (
    <figure className="site-browser" style={{ width, borderRadius: 18 }}>
      <div className="site-browser-bar" aria-hidden="true" style={{ height: 38 }}>
        <span />
        <span />
        <span />
        <i style={{ fontSize: 13, height: 22, lineHeight: "22px" }}>{address}</i>
      </div>
      <div className="relative overflow-hidden" style={{ width, height: (width * 1000) / 1600 }}>
        {children}
      </div>
    </figure>
  );
}

function Shot({ src }: { src: string }) {
  return <img src={src} alt="" width={1600} height={1000} decoding="async" draggable={false} className="absolute inset-0 size-full" />;
}

function Phone({ src, width }: { src: string; width: number }) {
  return (
    <figure className="site-phone" style={{ width, borderRadius: width * 0.15, padding: width * 0.03 }}>
      <img src={src} alt="" width={600} height={1301} decoding="async" draggable={false} style={{ borderRadius: width * 0.12 }} />
    </figure>
  );
}

/* ---------- Texto ---------- */

function Caption({ t, from, to, title, sub, top = 58 }: { t: MotionValue<number>; from: number; to: number; title: string; sub?: string; top?: number }) {
  return (
    <Layer
      t={t}
      tr={{ at: [from, from + 0.7, to - 0.5, to], o: [0, 1, 1, 0], y: [18, 0, 0, -12], b: [6, 0, 0, 4] }}
      className="showreel-caption left-0 right-0 z-30 text-center"
      style={{ top }}
    >
      <p className="mx-auto max-w-[1300px] font-semibold text-[#0d0d0f]" style={{ fontSize: 50, lineHeight: 1.1 }}>
        {title}
      </p>
      {sub && (
        <p className="mt-3 text-[#5c5c63]" style={{ fontSize: 22 }}>
          {sub}
        </p>
      )}
    </Layer>
  );
}

function Word({ t, at, out, children, className }: { t: MotionValue<number>; at: number; out: number; children: ReactNode; className?: string }) {
  const style = useTrack(t, { at: [at, at + 0.55, out - 0.4, out], o: [0, 1, 1, 0], y: [24, 0, 0, -16], b: [8, 0, 0, 4] });
  return (
    <motion.span className={`inline-block ${className ?? ""}`} style={style}>
      {children}
    </motion.span>
  );
}

/* ---------- Cursor e cliques (coordenadas da captura de 900 px) ---------- */

function Cursor({ t, points, clicks, visible }: { t: MotionValue<number>; points: [number, number, number][]; clicks: number[]; visible: [number, number] }) {
  const at = points.map((p) => p[0]);
  const x = useTransform(t, at, points.map((p) => px(p[1])), { clamp: true, ease: easeInOut });
  const y = useTransform(t, at, points.map((p) => px(p[2])), { clamp: true, ease: easeInOut });
  const opacity = useTransform(t, [visible[0] - 0.2, visible[0], visible[1], visible[1] + 0.2], [0, 1, 1, 0], { clamp: true });
  const press = useTransform(t, (v) => (clicks.some((c) => v >= c && v < c + 0.18) ? 0.82 : 1));
  return (
    <motion.div className="pointer-events-none absolute left-0 top-0 z-20" style={{ x, y, opacity }}>
      {clicks.map((c) => (
        <Ripple key={c} t={t} at={c} />
      ))}
      <motion.svg width="30" height="30" viewBox="0 0 24 24" style={{ scale: press, originX: 0, originY: 0, filter: "drop-shadow(0 3px 6px rgba(0,0,0,.35))" }}>
        <path d="M4 2l15 11.5-6.6.9 3.9 7.2-2.6 1.4-3.9-7.3L4 20z" fill="#111" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      </motion.svg>
    </motion.div>
  );
}

function Ripple({ t, at }: { t: MotionValue<number>; at: number }) {
  const scale = useTransform(t, [at, at + 0.6], [0.2, 2.4], { clamp: true });
  const opacity = useTransform(t, [at - 0.01, at, at + 0.6], [0, 0.55, 0], { clamp: true });
  return (
    <motion.span
      className="absolute rounded-full"
      style={{ left: -18, top: -18, width: 40, height: 40, background: "var(--accent-600)", scale, opacity }}
    />
  );
}

/** Um anel a marcar a zona onde se clicou (coordenadas da captura de 900 px). */
function Ring({ t, box, at, out }: { t: MotionValue<number>; box: [number, number, number, number]; at: number; out: number }) {
  const opacity = useTransform(t, [at, at + 0.3, out - 0.3, out], [0, 1, 1, 0], { clamp: true });
  const scale = useTransform(t, [at, at + 0.35], [1.12, 1], { clamp: true, ease: easeInOut });
  return (
    <motion.span
      className="pointer-events-none absolute z-10 rounded-[10px]"
      style={{
        left: px(box[0]) - 4,
        top: px(box[1]) - 4,
        width: px(box[2]) + 8,
        height: px(box[3]) + 8,
        boxShadow: "0 0 0 3px var(--accent-600), 0 0 0 9px color-mix(in oklab, var(--accent-600) 18%, transparent)",
        opacity,
        scale,
      }}
    />
  );
}

/** Um campo que se preenche sozinho: tapa o texto da captura e revela o novo, letra a letra. */
function Typing({ t, box, text, at, dur, show }: { t: MotionValue<number>; box: [number, number, number, number]; text: string; at: number; dur: number; show: [number, number] }) {
  const clip = useTransform(t, [at, at + dur], [100, 0], { clamp: true });
  const clipPath = useTransform(clip, (c) => `inset(0 ${c}% 0 0)`);
  const opacity = useTransform(t, [show[0], show[0] + 0.05, show[1] - 0.05, show[1]], [0, 1, 1, 0], { clamp: true });
  return (
    <motion.div
      className="absolute z-10 flex items-center bg-white"
      style={{ left: px(box[0]), top: px(box[1]), width: px(box[2]), height: px(box[3]), opacity, paddingLeft: px(6) }}
    >
      <motion.span className="whitespace-nowrap text-[#111]" style={{ fontSize: px(10.5), clipPath }}>
        {text}
      </motion.span>
    </motion.div>
  );
}

/* ---------- Cena 1: o impacto inicial ---------- */

function SceneIntro({ t }: { t: MotionValue<number> }) {
  const headline = ["Transforma", "apresentações", "em", "resultados."];
  const verbs = ["Cria.", "Automatiza.", "Apresenta.", "Escala."];
  return (
    <>
      <Layer
        t={t}
        tr={{ at: [0.15, 1.3, 2.1, 3.0, 5.9, 6.5], o: [0, 1, 1, 1, 1, 0], s: [0.9, 1, 1, 0.56, 0.56, 0.56], y: [24, 0, 0, -178, -178, -200], b: [14, 0, 0, 0, 0, 6] }}
        className="z-20"
        style={{ left: (W - 560) / 2, top: 210, width: 560 }}
      >
        <img src={logo} alt="" width={900} height={450} draggable={false} className="block w-full" />
      </Layer>
      <div className="showreel-caption absolute inset-x-0 z-20 text-center font-semibold text-[#0d0d0f]" style={{ top: 268, fontSize: 64, lineHeight: 1.08 }}>
        {headline.map((w, i) => (
          <Word key={w} t={t} at={2.3 + i * 0.13} out={6.2} className="mx-[0.14em]">
            {w}
          </Word>
        ))}
      </div>
      <div className="showreel-caption absolute inset-x-0 z-20 text-center text-[#4a4a50]" style={{ top: 362, fontSize: 26 }}>
        {verbs.map((w, i) => (
          <Word key={w} t={t} at={3.2 + i * 0.2} out={6.1} className="mx-[0.3em]">
            {w.slice(0, -1)}
            <span style={{ color: "var(--accent-600)" }}>.</span>
          </Word>
        ))}
      </div>
      <Layer
        t={t}
        tr={{ at: [3.5, 5.0, 6.0, 6.6, 6.8], o: [0, 1, 1, 1, 0], y: [560, 300, 250, 0, 0], rx: [44, 26, 20, 0, 0], s: [0.84, 0.9, 0.92, 1, 1] }}
        className="z-10"
        style={{ left: (W - FW) / 2, top: 175, transformPerspective: 2200, originY: 0 }}
      >
        <Browser>
          <Shot src={painel} />
        </Browser>
      </Layer>
    </>
  );
}

/* ---------- Cena 2: criar o webinar ---------- */

const CHECKLIST: [string, number][] = [
  ["Novo webinar criado", 7.7],
  ["Modo: uma data", 9.5],
  ["Data e hora definidas", 11.6],
  ["Oferta configurada", 12.7],
  ["Sala pronta a abrir", 13.6],
];

function CheckRow({ t, label, at }: { t: MotionValue<number>; label: string; at: number }) {
  const done = useTransform(t, [at, at + 0.3], [0, 1], { clamp: true });
  const text = useTransform(t, [at - 0.3, at + 0.2], [0.45, 1], { clamp: true });
  return (
    <li className="flex items-center gap-3" style={{ fontSize: 19 }}>
      <span className="relative grid size-7 place-items-center rounded-full border-2 border-[#e2e0dc]">
        <motion.span className="absolute inset-[-2px] grid place-items-center rounded-full text-white" style={{ background: "var(--accent-600)", opacity: done, scale: done }}>
          <Check size={15} strokeWidth={3} />
        </motion.span>
      </span>
      <motion.span className="font-medium text-[#141416]" style={{ opacity: text }}>
        {label}
      </motion.span>
    </li>
  );
}

function SceneCreate({ t }: { t: MotionValue<number> }) {
  // A câmara aproxima-se do painel da agenda e volta; no fim a moldura roda para dar lugar à sala.
  const zoom = useTrack(t, { at: [8.6, 9.5, 11.7, 12.4], s: [1, 1.3, 1.3, 1] });
  return (
    <>
      <Caption t={t} from={6.7} to={15} title="O teu próximo webinar começa aqui." />
      <Layer
        t={t}
        tr={{ at: [6.5, 6.6, 14.1, 15.0], o: [0, 1, 1, 0], ry: [0, 0, 0, -30], x: [0, 0, 0, -320], s: [1, 1, 1, 0.82] }}
        className="z-10"
        style={{ left: (W - FW) / 2, top: 175, transformPerspective: 2200 }}
      >
        <Browser>
          <motion.div className="absolute inset-0" style={{ scale: zoom.scale, originX: 0.06, originY: 0.12 }}>
            <Fade t={t} at={[8.4, 8.8]} o={[1, 0]} src={painel} />
            <Fade t={t} at={[8.4, 8.8, 11.9, 12.3]} o={[0, 1, 1, 0]} src={editorAgenda} />
            <Fade t={t} at={[11.9, 12.3]} o={[0, 1]} src={editorOferta} />
            <Ring t={t} box={[58, 93, 91, 46]} at={9.45} out={11.9} />
            <Typing t={t} box={[60, 284, 80, 18]} text="15/10/2026" at={10.15} dur={0.7} show={[8.5, 11.95]} />
            <Typing t={t} box={[158, 284, 70, 18]} text="20:00" at={11.15} dur={0.45} show={[8.5, 11.95]} />
            <Cursor
              t={t}
              visible={[6.9, 14.1]}
              clicks={[7.6, 9.4, 10.0, 11.05, 13.4]}
              points={[
                [6.8, 640, 470],
                [7.5, 834, 34],
                [8.9, 330, 300],
                [9.3, 103, 116],
                [9.9, 100, 292],
                [10.95, 196, 292],
                [12.6, 520, 220],
                [13.3, 227, 15],
                [14.2, 320, 140],
              ]}
            />
          </motion.div>
        </Browser>
      </Layer>
      <Layer
        t={t}
        tr={{ at: [7.3, 7.9, 14.0, 14.6], o: [0, 1, 1, 0], x: [40, 0, 0, 30], y: [10, 0, 0, 0] }}
        className="z-20 rounded-[20px] bg-white/95 p-7 shadow-[0_30px_80px_-30px_rgba(20,14,10,.45)] ring-1 ring-black/5 backdrop-blur"
        style={{ left: 1150, top: 300, width: 360 }}
      >
        <p className="mb-5 font-semibold uppercase text-[#8a8a90]" style={{ fontSize: 13, letterSpacing: "0.14em" }}>
          Novo webinar
        </p>
        <ul className="grid gap-4">
          {CHECKLIST.map(([label, at]) => (
            <CheckRow key={label} t={t} label={label} at={at} />
          ))}
        </ul>
      </Layer>
    </>
  );
}

/* ---------- Cena 3: a sala ---------- */

const CHAT: [string, string, number][] = [
  ["Marta", "Boa noite! A ver de Lisboa 👋", 16.2],
  ["Joana", "Isto é mesmo útil", 17.4],
  ["Rui", "Já estou a tirar notas ✍️", 18.6],
  ["Inês", "Dá para ver depois?", 19.8],
  ["Paulo", "🔥🔥🔥", 21.0],
  ["Carla", "Quero entrar na turma!", 22.2],
];

function ChatLine({ t, index }: { t: MotionValue<number>; index: number }) {
  const [name, text, at] = CHAT[index]!;
  const later = CHAT.slice(index + 1).map((m) => m[2]);
  const y = useTransform(t, (v) => {
    const pushed = later.reduce((sum, tj) => sum + Math.min(1, Math.max(0, (v - (tj - 0.3)) / 0.3)), 0);
    return px(368) - pushed * px(19);
  });
  const opacity = useTransform(t, [at - 0.3, at], [0, 1], { clamp: true });
  const x = useTransform(t, [at - 0.3, at], [12, 0], { clamp: true });
  return (
    <motion.p className="absolute whitespace-nowrap" style={{ left: px(661), top: 0, y, x, opacity, fontSize: px(10.4) }}>
      <b className="font-semibold text-white">{name}</b> <span className="text-[#c9c9cf]">{text}</span>
    </motion.p>
  );
}

function Heart({ t, k }: { t: MotionValue<number>; k: number }) {
  const phase = useTransform(t, (v) => {
    const p = (v - 16 - k * 0.55) / 2.6;
    return p < 0 ? -1 : p - Math.floor(p);
  });
  const y = useTransform(phase, (p) => (p < 0 ? 0 : -p * px(150)));
  const x = useTransform(phase, (p) => (p < 0 ? 0 : Math.sin(p * Math.PI * 2 + k) * px(10)));
  const opacity = useTransform(phase, (p) => (p < 0 ? 0 : p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85));
  return (
    <motion.span className="absolute" style={{ left: px(869), top: px(522), x, y, opacity, fontSize: px(14) }}>
      {k % 3 === 1 ? "🔥" : "❤️"}
    </motion.span>
  );
}

function SceneRoom({ t }: { t: MotionValue<number> }) {
  const push = useTrack(t, { at: [15.5, 24.5], s: [1, 1.05] });
  return (
    <>
      <Caption t={t} from={15.1} to={25} title="Uma experiência pensada para envolver." />
      <Layer
        t={t}
        tr={{ at: [15.4, 16.0, 24.4, 25], o: [0, 1, 1, 0] }}
        className="z-30 rounded-full bg-[#141416]/85 px-4 py-1.5 font-medium text-white"
        style={{ left: 140, top: 186, fontSize: 14 }}
      >
        Demonstração · interações simuladas
      </Layer>
      <Layer
        t={t}
        tr={{ at: [14.6, 15.7, 24.2, 25], o: [0, 1, 1, 0], x: [380, 0, 0, -120], ry: [-30, -6, 4, 10], s: [0.84, 1, 1, 0.96], b: [6, 0, 0, 6] }}
        className="z-10"
        style={{ left: 110, top: 175, transformPerspective: 2200 }}
      >
        <Browser address="sala.novawebinar.com">
          <motion.div className="absolute inset-0" style={{ scale: push.scale, originX: 0.35, originY: 0.5 }}>
            <Shot src={salaAoVivo} />
            {CHAT.map((m, i) => (
              <ChatLine key={m[0]} t={t} index={i} />
            ))}
            {Array.from({ length: 6 }, (_, k) => (
              <Heart key={k} t={t} k={k} />
            ))}
          </motion.div>
        </Browser>
      </Layer>
      <Layer
        t={t}
        tr={{ at: [16.8, 18.3, 24.2, 25], o: [0, 1, 1, 0], y: [280, 0, -12, -40], ry: [-34, -14, -10, -6], rx: [12, 4, 4, 4], s: [0.9, 1, 1, 1] }}
        className="z-20"
        style={{ left: 1225, top: 290, transformPerspective: 1600 }}
      >
        <Phone src={salaAoVivoTelemovel} width={262} />
      </Layer>
    </>
  );
}

/* ---------- Cena 4: automação ---------- */

const NODES = [
  { icon: Video, title: "Webinar criado", sub: "Vídeo, agenda e oferta" },
  { icon: UserPlus, title: "Inscrição", sub: "Página e formulário" },
  { icon: Radio, title: "Apresentação", sub: "A sala abre à hora marcada" },
  { icon: ShoppingBag, title: "Oferta", sub: "Entra no minuto que definiu" },
] as const;
const NODE_W = 262;
const NODE_GAP = 84;
const NODE_LEFT = (W - (NODES.length * NODE_W + (NODES.length - 1) * NODE_GAP)) / 2;
const NODE_TOP = 360;
const nodeCenter = (i: number) => NODE_LEFT + i * (NODE_W + NODE_GAP) + NODE_W / 2;
const PULSE: [number, number] = [29.2, 32.8];
const pulseX = (v: number) => nodeCenter(0) + ((v - PULSE[0]) / (PULSE[1] - PULSE[0])) * (nodeCenter(3) - nodeCenter(0));

function FlowNode({ t, i }: { t: MotionValue<number>; i: number }) {
  const node = NODES[i]!;
  const Icon = node.icon;
  const enter = 25.9 + i * 0.5;
  const active = useTransform(t, (v): number => {
    if (v < PULSE[0] - 0.2) return 0;
    const reached = pulseX(Math.min(v, PULSE[1])) >= nodeCenter(i) - 40;
    return reached ? 1 : 0;
  });
  const glow = useTransform(t, (v): number => {
    if (v < PULSE[0] || v > PULSE[1] + 0.6) return 0;
    return Math.max(0, 1 - Math.abs(pulseX(v) - nodeCenter(i)) / 160);
  });
  const ring = useTransform(glow, (g) => `0 0 0 ${2 + g * 4}px color-mix(in oklab, var(--accent-600) ${Math.round(20 + g * 60)}%, transparent), 0 24px 60px -28px rgba(20,14,10,.4)`);
  const iconBg = useTransform(active, [0, 1], ["#f3f2ef", "var(--accent-600)"]);
  const iconColor = useTransform(active, [0, 1], ["#2a2a2e", "#ffffff"]);
  return (
    <Layer
      t={t}
      tr={{ at: [enter, enter + 0.6, 34.2, 35], o: [0, 1, 1, 0], y: [34, 0, 0, -14], s: [0.94, 1, 1, 1] }}
      className="z-20"
      style={{ left: NODE_LEFT + i * (NODE_W + NODE_GAP), top: NODE_TOP, width: NODE_W }}
    >
      <motion.div className="rounded-[20px] bg-white p-6" style={{ boxShadow: ring }}>
        <div className="flex items-center justify-between">
          <motion.span className="grid size-12 place-items-center rounded-[14px]" style={{ background: iconBg, color: iconColor }}>
            <Icon size={24} />
          </motion.span>
          <motion.span className="grid size-7 place-items-center rounded-full bg-[#1f8a4c] text-white" style={{ opacity: active, scale: active }}>
            <Check size={15} strokeWidth={3} />
          </motion.span>
        </div>
        <p className="mt-5 font-semibold text-[#111]" style={{ fontSize: 22 }}>
          {node.title}
        </p>
        <p className="mt-1 text-[#66666d]" style={{ fontSize: 16 }}>
          {node.sub}
        </p>
      </motion.div>
    </Layer>
  );
}

const BRANCH = [
  { icon: Mail, label: "Lembrete por e-mail" },
  { icon: MessageCircle, label: "Lembrete por WhatsApp" },
  { icon: RotateCcw, label: "Replay para quem faltou" },
] as const;

function SceneFlow({ t }: { t: MotionValue<number> }) {
  const draw = useTransform(t, [26.0, 28.6], [0, 1], { clamp: true, ease: easeInOut });
  const branchDraw = useTransform(t, [28.0, 28.9], [0, 1], { clamp: true });
  const lineOpacity = useTransform(t, [25.6, 26.0, 34.2, 35], [0, 1, 1, 0], { clamp: true });
  const dotX = useTransform(t, (v) => pulseX(Math.min(Math.max(v, PULSE[0]), PULSE[1])));
  const dotOpacity = useTransform(t, [PULSE[0] - 0.2, PULSE[0], PULSE[1], PULSE[1] + 0.3], [0, 1, 1, 0], { clamp: true });
  const lineY = NODE_TOP + 74;
  const x2 = nodeCenter(1);
  return (
    <>
      <Caption t={t} from={25.1} to={35} title="Automatiza o processo. Concentra-te no crescimento." />
      <Layer
        t={t}
        tr={{ at: [24.8, 25.8, 34.2, 35], o: [0, 0.22, 0.22, 0], s: [1.06, 1, 1, 0.97] }}
        className="z-0"
        style={{ left: (W - FW) / 2, top: 205 }}
      >
        <Browser>
          <Shot src={fluxo} />
        </Browser>
      </Layer>
      <motion.svg className="absolute inset-0 z-10" width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ opacity: lineOpacity }}>
        <motion.path
          d={`M ${nodeCenter(0)} ${lineY} L ${nodeCenter(3)} ${lineY}`}
          stroke="color-mix(in oklab, var(--accent-600) 55%, #d9d6d0)"
          strokeWidth={3}
          strokeLinecap="round"
          fill="none"
          style={{ pathLength: draw }}
        />
        <motion.path
          d={`M ${x2} ${NODE_TOP + 170} L ${x2} ${NODE_TOP + 228} L ${x2 + 520} ${NODE_TOP + 228}`}
          stroke="#cfccc6"
          strokeWidth={2.5}
          strokeDasharray="6 8"
          fill="none"
          style={{ pathLength: branchDraw }}
        />
        <motion.circle cx={0} cy={lineY} r={9} fill="var(--accent-600)" style={{ x: dotX, opacity: dotOpacity, filter: "drop-shadow(0 0 10px var(--accent-600))" }} />
      </motion.svg>
      {NODES.map((n, i) => (
        <FlowNode key={n.title} t={t} i={i} />
      ))}
      {BRANCH.map(({ icon: Icon, label }, i) => (
        <Layer
          key={label}
          t={t}
          tr={{ at: [28.3 + i * 0.25, 28.8 + i * 0.25, 34.2, 35], o: [0, 1, 1, 0], y: [16, 0, 0, -8] }}
          className="z-20 flex items-center gap-2.5 rounded-full bg-white px-5 py-3 font-medium text-[#222] shadow-[0_14px_40px_-20px_rgba(20,14,10,.45)] ring-1 ring-black/5"
          style={{ left: x2 + 60 + i * 255, top: NODE_TOP + 205, fontSize: 16 }}
        >
          <Icon size={18} className="text-[var(--accent-600)]" />
          {label}
        </Layer>
      ))}
    </>
  );
}

/* ---------- Cena 5: conversão e resultados ---------- */

const FUNNEL: [string, number][] = [
  ["Inscritos", 96],
  ["Assistiram", 64],
  ["Viram a oferta", 33],
  ["Clicaram", 14],
  ["Compraram", 5],
];

function Bar({ t, label, value, i }: { t: MotionValue<number>; label: string; value: number; i: number }) {
  const at = 41.0 + i * 0.28;
  const grow = useTransform(t, [at, at + 0.9], [0, 1], { clamp: true, ease: easeInOut });
  const count = useTransform(grow, (g) => Math.round(g * value).toString());
  return (
    <li>
      <div className="flex items-baseline justify-between" style={{ fontSize: 16 }}>
        <span className="text-[#55555c]">{label}</span>
        <motion.span className="font-semibold tabular-nums text-[#111]" style={{ fontSize: 20 }}>
          {count}
        </motion.span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#f0eeea]">
        <motion.div className="h-full rounded-full" style={{ width: `${(value / 96) * 100}%`, scaleX: grow, originX: 0, background: i === 4 ? "var(--accent-600)" : "#2b2b30" }} />
      </div>
    </li>
  );
}

function SceneConvert({ t }: { t: MotionValue<number> }) {
  const zoom = useTrack(t, { at: [36.4, 37.9, 39.3, 40.0], s: [1, 1.75, 1.75, 1] });
  return (
    <>
      <Caption t={t} from={35.1} to={45} title="Da atenção à ação." />
      <Layer
        t={t}
        tr={{ at: [34.6, 35.6, 39.7, 40.3], o: [0, 1, 1, 0], y: [60, 0, 0, 0], s: [0.94, 1, 1, 1] }}
        className="z-10"
        style={{ left: (W - FW) / 2, top: 175 }}
      >
        <Browser address="sala.novawebinar.com">
          <motion.div className="absolute inset-0" style={{ scale: zoom.scale, originX: 0.86, originY: 0.83 }}>
            <Shot src={salaOferta} />
            <Ring t={t} box={[668, 484, 214, 25]} at={37.8} out={39.4} />
            <Cursor t={t} visible={[37.0, 39.3]} clicks={[38.4]} points={[[37.0, 620, 330], [38.2, 760, 497], [39.3, 780, 520]]} />
          </motion.div>
        </Browser>
      </Layer>
      <Layer
        t={t}
        tr={{ at: [38.6, 39.1, 40.0, 40.5], o: [0, 1, 1, 0], y: [-20, 0, 0, -10], s: [0.96, 1, 1, 1] }}
        className="z-30 flex items-center gap-4 rounded-[18px] bg-white px-5 py-4 shadow-[0_26px_70px_-28px_rgba(20,14,10,.5)] ring-1 ring-black/5"
        style={{ left: 1090, top: 200, width: 380 }}
      >
        <span className="grid size-11 place-items-center rounded-full bg-[#e9f6ee] text-[#1f8a4c]">
          <ShoppingBag size={20} />
        </span>
        <span>
          <span className="block font-semibold text-[#111]" style={{ fontSize: 18 }}>
            Nova compra · Turma Vende+
          </span>
          <span className="block text-[#6a6a71]" style={{ fontSize: 14 }}>
            Compra aprovada · demonstração
          </span>
        </span>
      </Layer>
      <Layer
        t={t}
        tr={{ at: [39.7, 40.5, 44.2, 45], o: [0, 1, 1, 0], s: [0.97, 1, 1, 1.02] }}
        className="z-10"
        style={{ left: 120, top: 175 }}
      >
        <Browser width={1000}>
          <Shot src={metricas} />
        </Browser>
      </Layer>
      <Layer
        t={t}
        tr={{ at: [40.3, 41.0, 44.2, 45], o: [0, 1, 1, 0], x: [60, 0, 0, 0], ry: [-18, -8, -8, -8] }}
        className="z-20 rounded-[22px] bg-white p-8 shadow-[0_40px_100px_-40px_rgba(20,14,10,.55)] ring-1 ring-black/5"
        style={{ left: 1000, top: 330, width: 470, transformPerspective: 1800 }}
      >
        <p className="font-semibold text-[#111]" style={{ fontSize: 22 }}>
          Da inscrição à compra
        </p>
        <p className="mt-1 text-[#8a8a90]" style={{ fontSize: 14 }}>
          Dados demonstrativos
        </p>
        <ul className="mt-6 grid gap-4">
          {FUNNEL.map(([label, value], i) => (
            <Bar key={label} t={t} label={label} value={value} i={i} />
          ))}
        </ul>
      </Layer>
    </>
  );
}

/* ---------- Cena 6: o fecho ---------- */

function SceneFinale({ t, interactive }: { t: MotionValue<number>; interactive: boolean }) {
  const recede: Track = { at: [45, 47.2, 49.2, 50.2, 55.3, 56], o: [0, 1, 1, 0.16, 0.16, 0] };
  const left = useTrack(t, { ...recede, x: [-900, -440, -470, -470, -470, -470], ry: [42, 24, 22, 22, 22, 22], s: [0.85, 0.9, 0.9, 0.74, 0.74, 0.74], y: [40, 0, 0, 260, 260, 260] });
  const right = useTrack(t, { ...recede, x: [900, 440, 470, 470, 470, 470], ry: [-42, -24, -22, -22, -22, -22], s: [0.85, 0.9, 0.9, 0.74, 0.74, 0.74], y: [40, 0, 0, 260, 260, 260] });
  const center = useTrack(t, { ...recede, y: [320, 30, 20, 330, 330, 330], s: [0.86, 1, 1, 0.78, 0.78, 0.78], rx: [24, 6, 4, 10, 10, 10] });
  const phone = useTrack(t, { ...recede, x: [300, 0, 0, 0, 0, 0], y: [300, 0, -10, 300, 300, 300], ry: [-30, -12, -10, -10, -10, -10] });
  const cta = useTransform(t, (v) => (interactive && v > 50.6 && v < 55.6 ? "auto" : "none"));
  const frame = (w: number) => ({ left: (W - w) / 2, top: 210, transformPerspective: 2200 }) as const;
  return (
    <>
      <motion.div className="absolute z-10" style={{ ...frame(820), ...left }}>
        <Browser width={820}>
          <Shot src={editorAgenda} />
        </Browser>
      </motion.div>
      <motion.div className="absolute z-10" style={{ ...frame(820), ...right }}>
        <Browser width={820} address="sala.novawebinar.com">
          <Shot src={salaOferta} />
        </Browser>
      </motion.div>
      <motion.div className="absolute z-20" style={{ ...frame(960), ...center }}>
        <Browser width={960}>
          <Shot src={painel} />
        </Browser>
      </motion.div>
      <motion.div className="absolute z-30" style={{ left: 1200, top: 360, transformPerspective: 1600, ...phone }}>
        <Phone src={salaVendasTelemovel} width={210} />
      </motion.div>
      <Layer
        t={t}
        tr={{ at: [49.2, 50.4, 55.3, 56], o: [0, 1, 1, 0] }}
        className="z-40"
        style={{ inset: 0, background: "radial-gradient(70% 60% at 50% 38%, rgba(250,249,247,.97) 40%, rgba(250,249,247,.55) 75%, rgba(250,249,247,0) 100%)" }}
      />
      <Layer
        t={t}
        tr={{ at: [49.6, 50.6, 55.3, 56], o: [0, 1, 1, 0], s: [0.92, 1, 1, 1], b: [12, 0, 0, 4] }}
        className="z-50"
        style={{ left: (W - 380) / 2, top: 120, width: 380 }}
      >
        <img src={logo} alt="" width={900} height={450} draggable={false} className="block w-full" />
      </Layer>
      <Layer
        t={t}
        tr={{ at: [50.2, 51.0, 55.3, 56], o: [0, 1, 1, 0], y: [20, 0, 0, -8] }}
        className="showreel-caption inset-x-0 z-50 text-center"
        style={{ top: 330 }}
      >
        <p className="font-semibold text-[#0d0d0f]" style={{ fontSize: 58, lineHeight: 1.08 }}>
          NovaWebinar. <span className="font-normal text-[#4a4a50]">O palco do teu crescimento.</span>
        </p>
      </Layer>
      <Layer
        t={t}
        tr={{ at: [50.7, 51.4, 55.3, 56], o: [0, 1, 1, 0], y: [16, 0, 0, 0], s: [0.96, 1, 1, 1] }}
        className="z-50 flex justify-center"
        style={{ left: 0, right: 0, top: 450 }}
      >
        <motion.span style={{ pointerEvents: cta }}>
          <Link
            to="/auth/register"
            tabIndex={-1}
            className="inline-flex items-center rounded-full font-semibold text-white shadow-[0_20px_50px_-20px_var(--accent-600)]"
            style={{ background: "var(--accent-600)", height: 64, paddingInline: 40, fontSize: 22 }}
          >
            Começar agora
          </Link>
        </motion.span>
      </Layer>
    </>
  );
}

/* ---------- O palco e os controlos ---------- */

const PRELOAD = [logo, painel, editorAgenda, editorOferta, salaAoVivo, salaAoVivoTelemovel, salaOferta, salaVendasTelemovel, fluxo, metricas];

function Segment({ t, i, onSeek }: { t: MotionValue<number>; i: number; onSeek: (v: number) => void }) {
  const s = SCENES[i]!;
  const fill = useTransform(t, [s.start, s.end], [0, 1], { clamp: true });
  return (
    <button
      type="button"
      className="group flex h-8 flex-1 items-center"
      aria-label={`Ir para «${s.label}»`}
      onClick={() => onSeek(s.start + 0.01)}
    >
      <span className="relative block h-[3px] w-full overflow-hidden rounded-full bg-black/15 transition-[height] group-hover:h-[5px]">
        <motion.span className="absolute inset-0 rounded-full bg-[#111]" style={{ scaleX: fill, originX: 0 }} />
      </span>
    </button>
  );
}

export default function Showreel() {
  const reduced = useReducedMotion();
  const t = useMotionValue(reduced ? 52 : 0);
  const [playing, setPlaying] = useState(!reduced);
  const [scene, setScene] = useState(sceneAt(t.get()));
  const [ready, setReady] = useState(false);
  const [width, setWidth] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(playing);
  const visibleRef = useRef(false);
  playingRef.current = playing;

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const update = () => setWidth(box.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    const io = new IntersectionObserver(([entry]) => {
      visibleRef.current = Boolean(entry?.isIntersecting);
    }, { threshold: 0.15 });
    io.observe(box);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  // Só arranca com as capturas descodificadas: nada aparece a meio de carregar.
  useEffect(() => {
    let alive = true;
    void Promise.all(
      PRELOAD.map((src) => {
        const img = new Image();
        img.src = src;
        return img.decode().catch(() => undefined);
      }),
    ).then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const play = () => {
      t.set(0);
      setPlaying(true);
    };
    window.addEventListener(SHOWREEL_PLAY_EVENT, play);
    return () => window.removeEventListener(SHOWREEL_PLAY_EVENT, play);
  }, [t]);

  useAnimationFrame((_, delta) => {
    if (!ready || !playingRef.current || !visibleRef.current || document.hidden) return;
    t.set((t.get() + Math.min(delta, 100) / 1000) % SHOWREEL_DURATION);
  });

  useMotionValueEvent(t, "change", (v) => {
    const i = sceneAt(v);
    setScene((current) => (current === i ? current : i));
  });

  const seek = (v: number) => {
    t.set(v);
    setScene(sceneAt(v));
  };
  const scale = width / W;
  const narrow = width > 0 && width < 640;
  const current = SCENES[scene]!;

  return (
    <div>
      <div
        ref={boxRef}
        className="showreel-stage relative aspect-video w-full overflow-hidden rounded-[18px] ring-1 ring-black/[.06] sm:rounded-[28px]"
        data-narrow={narrow || undefined}
      >
        <div
          aria-hidden="true"
          className="absolute left-0 top-0 origin-top-left select-none"
          style={{ width: W, height: H, transform: `scale(${scale})`, perspective: 2400 }}
        >
          {width > 0 && (
            <>
              <SceneIntro t={t} />
              <SceneCreate t={t} />
              <SceneRoom t={t} />
              <SceneFlow t={t} />
              <SceneConvert t={t} />
              <SceneFinale t={t} interactive={!narrow} />
            </>
          )}
        </div>
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[60]"
          initial={false}
          animate={{ opacity: ready ? 0 : 1 }}
          transition={{ duration: 0.6 }}
        >
          <ShowreelPoster />
        </motion.div>
        <div className="absolute inset-x-0 bottom-0 z-[70] flex items-center gap-3 px-3 pb-2 pt-6 sm:px-5 sm:pb-3">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="grid size-10 flex-none place-items-center rounded-full bg-white/90 text-[#111] shadow-[0_6px_20px_-8px_rgba(0,0,0,.35)] ring-1 ring-black/5 backdrop-blur transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-600)]"
            aria-label={playing ? "Pausar a apresentação" : "Reproduzir a apresentação"}
          >
            {playing ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4 translate-x-px" aria-hidden="true" />}
          </button>
          <div className="flex flex-1 gap-1.5" role="group" aria-label="Cenas da apresentação">
            {SCENES.map((s, i) => (
              <Segment key={s.label} t={t} i={i} onSeek={seek} />
            ))}
          </div>
          <span className="hidden flex-none text-[12px] text-[#6a6a71] md:block">Demonstração com dados fictícios</span>
        </div>
      </div>
      {narrow && (
        <div className="mt-4 min-h-[5.5rem] text-center" aria-hidden="true">
          <motion.p key={scene} className="text-[1.25rem] font-semibold leading-snug text-[#111]" initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            {current.title}
          </motion.p>
          <p className="mt-1 text-[0.9rem] text-[#6a6a71]">{scene === 5 ? "Demonstração com dados fictícios" : current.sub}</p>
        </div>
      )}
      <ol className="sr-only">
        {SCENES.map((s) => (
          <li key={s.label}>
            {s.title} {s.sub}
          </li>
        ))}
      </ol>
    </div>
  );
}
