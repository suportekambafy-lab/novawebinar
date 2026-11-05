/**
 * O leitor de um tutorial (tutorials.ts): a captura real com a câmara a aproximar-se, o cursor a
 * clicar, o anel na zona certa e o campo a preencher-se, passo a passo, com o título animado letra a
 * letra e a explicação por baixo. Um relógio único (`t`) conduz tudo por motion values; avança sozinho
 * e pára no fim. Com movimento reduzido não anda sozinho: cada passo mostra-se já no fim do gesto.
 */
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { TUTORIALS, type TutorialStep } from "@/components/tutorial/tutorials";
import type { TutorialId } from "@/components/tutorial/tutorial-routes";

const W = 900;
const H = 562.5;
/** Os momentos de cada passo, em segundos desde o seu início. */
const CLICK = 2.1;
const TYPE_AT = 2.5;
const TYPE_STEP = 0.06;
const SETTLED = 3.6;

const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const stepLength = (s: TutorialStep) => Math.max(6.4, s.typing ? TYPE_AT + s.typing.text.length * TYPE_STEP + 3 : 0);

function StepLayer({ t, step, start, end, first, last }: { t: MotionValue<number>; step: TutorialStep; start: number; end: number; first: boolean; last: boolean }) {
  const fade = 0.35;
  const opacity = useTransform(
    t,
    [start - fade, start, end - fade, end],
    [first ? 1 : 0, 1, 1, last ? 1 : 0],
    { clamp: true },
  );
  const visibility = useTransform(opacity, (o) => (o < 0.01 ? "hidden" : "visible"));
  const zoom = step.zoom ?? { s: 1, x: 0.5, y: 0.5 };
  // A câmara traz o ponto em destaque para o centro, sem nunca mostrar a margem da captura.
  const scale = useTransform(t, [start + 0.3, start + 1.7, end - 0.3, end], [1, zoom.s, zoom.s, zoom.s * 1.02], { clamp: true, ease });
  const pan = (size: number, focus: number) => (k: number) => Math.min(0, Math.max(size - k * size, size / 2 - k * focus * size));
  const panX = useTransform(scale, pan(W, zoom.x));
  const panY = useTransform(scale, pan(H, zoom.y));
  const points = step.cursor ?? [];
  const from = points[0] ?? [W / 2, H / 2];
  const to = points[points.length - 1] ?? from;
  const x = useTransform(t, [start + 0.7, start + CLICK - 0.15], [from[0], to[0]], { clamp: true, ease });
  const y = useTransform(t, [start + 0.7, start + CLICK - 0.15], [from[1], to[1]], { clamp: true, ease });
  const cursorOpacity = useTransform(t, [start + 0.5, start + 0.8, end - 0.6, end - 0.3], [0, 1, 1, 0], { clamp: true });
  const press = useTransform(t, (v) => (v >= start + CLICK && v < start + CLICK + 0.16 ? 0.8 : 1));
  const rippleScale = useTransform(t, [start + CLICK, start + CLICK + 0.6], [0.2, 2.4], { clamp: true });
  const rippleOpacity = useTransform(t, [start + CLICK - 0.01, start + CLICK, start + CLICK + 0.6], [0, 0.5, 0], { clamp: true });
  const ringOpacity = useTransform(t, [start + CLICK + 0.05, start + CLICK + 0.35], [0, 1], { clamp: true });
  const ringScale = useTransform(t, [start + CLICK + 0.05, start + CLICK + 0.4], [1.15, 1], { clamp: true, ease });
  const typed = step.typing;
  const typeEnd = typed ? TYPE_AT + typed.text.length * TYPE_STEP : 0;
  const clip = useTransform(t, [start + TYPE_AT, start + typeEnd], [100, 0], { clamp: true });
  const clipPath = useTransform(clip, (c) => `inset(0 ${c}% 0 0)`);
  return (
    <motion.div className="absolute inset-0 overflow-hidden" style={{ opacity, visibility }}>
      <motion.div className="absolute inset-0" style={{ scale, x: panX, y: panY, originX: 0, originY: 0 }}>
        <img src={step.shot} alt="" width={1600} height={1000} draggable={false} decoding="async" className="absolute inset-0 size-full" />
        {typed && (
          <div
            className="absolute flex items-center bg-white"
            style={{ left: typed.box[0], top: typed.box[1], width: typed.box[2], height: typed.box[3], paddingLeft: 4 }}
          >
            <motion.span className="whitespace-nowrap text-[#111]" style={{ fontSize: 10.5, clipPath }}>
              {typed.text}
            </motion.span>
          </div>
        )}
        {step.ring && (
          <motion.span
            className="pointer-events-none absolute rounded-[7px]"
            style={{
              left: step.ring[0] - 3,
              top: step.ring[1] - 3,
              width: step.ring[2] + 6,
              height: step.ring[3] + 6,
              boxShadow: "0 0 0 2px var(--accent-600), 0 0 0 7px color-mix(in oklab, var(--accent-600) 20%, transparent)",
              opacity: ringOpacity,
              scale: ringScale,
            }}
          />
        )}
        {points.length > 0 && (
          <motion.div className="pointer-events-none absolute left-0 top-0" style={{ x, y, opacity: cursorOpacity }}>
            <motion.span
              className="absolute rounded-full"
              style={{ left: -12, top: -12, width: 26, height: 26, background: "var(--accent-600)", scale: rippleScale, opacity: rippleOpacity }}
            />
            <motion.svg width="20" height="20" viewBox="0 0 24 24" style={{ scale: press, originX: 0, originY: 0, filter: "drop-shadow(0 2px 4px rgba(0,0,0,.35))" }}>
              <path d="M4 2l15 11.5-6.6.9 3.9 7.2-2.6 1.4-3.9-7.3L4 20z" fill="#111" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
            </motion.svg>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
}

/** O título letra a letra (styles.css, «kt-»); a palavra entre asteriscos na cor da marca. */
function KineticTitle({ text }: { text: string }) {
  let n = 0;
  return (
    <>
      {text.split(/(\*[^*]+\*)/).filter(Boolean).map((part, p) => {
        const marked = part.startsWith("*");
        const words = (marked ? part.slice(1, -1) : part).split(/(\s+)/);
        const body = words.map((w, i) =>
          /^\s+$/.test(w) ? " " : w ? (
            <span key={`${p}-${i}`} className="inline-block whitespace-nowrap">
              {[...w].map((ch) => (
                <span key={n} className="kt-char" style={{ animationDelay: `${(n++ * 0.018).toFixed(3)}s` }}>
                  {ch}
                </span>
              ))}
            </span>
          ) : null,
        );
        return marked ? (
          <span key={p} className="kt-hl" style={{ animationDelay: `${(n * 0.018 + 0.1).toFixed(3)}s` }}>
            {body}
          </span>
        ) : (
          <Fragment key={p}>{body}</Fragment>
        );
      })}
    </>
  );
}

export default function TutorialPlayer({ id, onDone }: { id: TutorialId; onDone: () => void }) {
  const tutorial = TUTORIALS[id];
  const reduced = useReducedMotion();
  const starts = useMemo(() => {
    let acc = 0;
    return tutorial.steps.map((s) => {
      const at = acc;
      acc += stepLength(s);
      return at;
    });
  }, [tutorial]);
  const total = starts[starts.length - 1]! + stepLength(tutorial.steps[tutorial.steps.length - 1]!);
  const settled = (i: number) => starts[i]! + (reduced ? SETTLED : 0.01);
  const t = useMotionValue(settled(0));
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(!reduced);
  const [ended, setEnded] = useState(false);
  const [width, setWidth] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const update = () => setWidth(box.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(box);
    return () => ro.disconnect();
  }, []);

  useAnimationFrame((_, delta) => {
    if (!playingRef.current || document.hidden) return;
    const next = t.get() + Math.min(delta, 100) / 1000;
    if (next >= total - 0.05) {
      t.set(total - 0.05);
      setPlaying(false);
      setEnded(true);
      return;
    }
    t.set(next);
  });

  useMotionValueEvent(t, "change", (v) => {
    let i = 0;
    while (i + 1 < starts.length && v >= starts[i + 1]!) i += 1;
    setIndex((current) => (current === i ? current : i));
  });

  const go = (i: number) => {
    const target = Math.max(0, Math.min(tutorial.steps.length - 1, i));
    t.set(settled(target));
    setIndex(target);
    setEnded(false);
  };
  const step = tutorial.steps[index]!;
  const last = index === tutorial.steps.length - 1;
  const progress = useTransform(t, [0, total], [0, 1], { clamp: true });

  return (
    <div className="flex flex-col">
      <div ref={boxRef} className="showreel-stage relative aspect-[16/10] w-full overflow-hidden" aria-hidden="true">
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: W, height: H, transform: `scale(${width / W})` }}>
          {width > 0 &&
            tutorial.steps.map((s, i) => (
              <StepLayer
                key={i}
                t={t}
                step={s}
                start={starts[i]!}
                end={starts[i]! + stepLength(s)}
                first={i === 0}
                last={i === tutorial.steps.length - 1}
              />
            ))}
        </div>
        <motion.div className="absolute inset-x-0 bottom-0 h-1 origin-left bg-[var(--accent-600)]" style={{ scaleX: progress }} />
      </div>
      <div className="grid gap-4 p-5 sm:p-7">
        <div>
          <p className="text-xs font-medium uppercase tracking-[.12em] text-muted-foreground">
            Tutorial · {tutorial.title} · passo {index + 1} de {tutorial.steps.length}
          </p>
          <DialogTitle className="mt-2 text-xl font-semibold leading-snug sm:text-2xl" key={index}>
            <KineticTitle text={step.title} />
          </DialogTitle>
          <DialogDescription className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-muted-foreground" aria-live="polite">
            {step.text}
          </DialogDescription>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ol className="flex flex-1 items-center gap-1.5" aria-label="Passos">
            {tutorial.steps.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Passo ${i + 1}: ${s.title.replaceAll("*", "")}`}
                  aria-current={i === index ? "step" : undefined}
                  className={`block h-2 rounded-full transition-all ${i === index ? "w-7 bg-[var(--accent-600)]" : "w-2 bg-black/15 hover:bg-black/30"}`}
                />
              </li>
            ))}
          </ol>
          <Button variant="ghost" size="icon" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Passo anterior">
            <ChevronLeft />
          </Button>
          {!reduced && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (ended) go(0);
                setPlaying((p) => (ended ? true : !p));
              }}
              aria-label={ended ? "Ver outra vez" : playing ? "Pausar" : "Continuar"}
            >
              {ended ? <RotateCcw /> : playing ? <Pause /> : <Play />}
            </Button>
          )}
          {last ? (
            <Button onClick={onDone}>Concluir</Button>
          ) : (
            <Button onClick={() => go(index + 1)}>
              Seguinte <ChevronRight />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
