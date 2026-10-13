/**
 * O movimento do site público, num só sítio: entrar ao rolar, contar números, desenhar linhas.
 * Tudo respeita «reduzir movimento» do sistema (fica sem deslocação, só a opacidade) e corre uma
 * única vez por elemento, para a página não parecer agitada ao subir e descer.
 */
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** A curva do site: sai depressa, assenta devagar (a mesma dos botões e do cabeçalho). */
export const EASE = [0.2, 0.8, 0.2, 1] as const;

/** Entra de baixo e desvanece; com movimento reduzido só desvanece. */
export function useRevealVariants(distance = 24): Variants {
  const reduced = useReducedMotion();
  return {
    hidden: { opacity: 0, y: reduced ? 0 : distance },
    shown: { opacity: 1, y: 0, transition: { duration: 0.7, ease: EASE } },
  };
}

/**
 * Um bloco que entra quando chega ao ecrã. `delay` escalona irmãos sem precisar de um contentor;
 * `as` escolhe a etiqueta (li, div, p…), para a semântica não mudar por causa do movimento.
 */
export function Reveal({
  children,
  delay = 0,
  distance = 24,
  className,
  as = "div",
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  className?: string | undefined;
  as?: "div" | "li" | "p" | "section" | "span";
  once?: boolean;
}) {
  const variants = useRevealVariants(distance);
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="shown"
      viewport={{ once, amount: 0.25, margin: "0px 0px -8% 0px" }}
      transition={{ delay }}
    >
      {children}
    </Tag>
  );
}

/**
 * Um contentor que escalona os filhos `Item`: cada um entra um pouco depois do anterior. Serve para
 * grelhas de cartões e listas; os filhos têm de ser `Item`.
 */
export function Stagger({
  children,
  className,
  as = "div",
  gap = 0.08,
  delay = 0,
}: {
  children: ReactNode;
  className?: string | undefined;
  as?: "div" | "ul" | "ol";
  gap?: number;
  delay?: number;
}) {
  const Tag = motion[as];
  return (
    <Tag
      className={className}
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.2, margin: "0px 0px -8% 0px" }}
      variants={{ hidden: {}, shown: { transition: { staggerChildren: gap, delayChildren: delay } } }}
    >
      {children}
    </Tag>
  );
}

export function Item({
  children,
  className,
  as = "div",
  distance = 24,
}: {
  children: ReactNode;
  className?: string | undefined;
  as?: "div" | "li";
  distance?: number;
}) {
  const variants = useRevealVariants(distance);
  const Tag = motion[as];
  return (
    <Tag className={className} variants={variants}>
      {children}
    </Tag>
  );
}

/** O título a entrar palavra a palavra, de baixo, como um letreiro a acender. */
export function Words({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  const words = text.split(" ");
  return (
    <motion.span
      className={className}
      initial="hidden"
      animate="shown"
      variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.06, delayChildren: delay } } }}
      aria-label={text}
    >
      {words.map((word, index) => (
        <span key={`${word}-${index}`} className="inline-block overflow-hidden pb-[0.1em] -mb-[0.1em] align-bottom" aria-hidden="true">
          <motion.span
            className="inline-block"
            variants={{
              hidden: { opacity: 0, y: reduced ? 0 : "0.9em" },
              shown: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
            }}
          >
            {word}
          </motion.span>
          {index < words.length - 1 ? " " : ""}
        </span>
      ))}
    </motion.span>
  );
}

/** Um número que conta de `from` até `to` quando chega ao ecrã (formato pt-PT, com espaço nos milhares). */
export function CountUp({
  from = 0,
  to,
  duration = 1.6,
  delay = 0,
  className,
}: {
  from?: number;
  to: number;
  duration?: number;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduced = useReducedMotion();
  const value = useMotionValue(from);
  const [shown, setShown] = useState(from);

  useEffect(() => {
    if (!inView) return;
    if (reduced) {
      setShown(to);
      return;
    }
    const controls = animate(value, to, {
      duration,
      delay,
      ease: EASE,
      onUpdate: (latest) => setShown(Math.round(latest)),
    });
    return () => controls.stop();
  }, [inView, reduced, to, duration, delay, value]);

  return (
    <span ref={ref} className={className}>
      {shown.toLocaleString("pt-PT")}
    </span>
  );
}

/** Uma linha SVG que se desenha quando chega ao ecrã (a `pathLength` vai de 0 a 1). */
export function DrawPath({
  d,
  className,
  duration = 1.8,
  delay = 0,
}: {
  d: string;
  className?: string;
  duration?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.path
      d={d}
      className={className}
      initial={{ pathLength: reduced ? 1 : 0, opacity: reduced ? 1 : 0.4 }}
      whileInView={{ pathLength: 1, opacity: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration, delay, ease: EASE }}
    />
  );
}

/**
 * Paralaxe suave ao rolar: o filho desloca-se `range` píxeis ao longo da passagem do elemento pelo ecrã.
 * Com movimento reduzido fica parado.
 */
export function Parallax({
  children,
  range = 40,
  className,
}: {
  children: ReactNode;
  range?: number;
  className?: string | undefined;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [range, -range]);
  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y: reduced ? 0 : y }}>{children}</motion.div>
    </div>
  );
}

/**
 * Corre `steps` ao longo do tempo quando o elemento chega ao ecrã: devolve quantos já «aconteceram».
 * Serve para os visuais do produto contarem uma história (mensagens a chegar, uma compra a entrar).
 */
export function useStory(ref: React.RefObject<Element | null>, steps: readonly number[], loopAfterMs = 0) {
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduced = useReducedMotion();
  const [done, setDone] = useState(reduced ? steps.length : 0);

  useEffect(() => {
    if (!inView || reduced) return;
    let timers: number[] = [];
    const play = () => {
      setDone(0);
      timers = steps.map((at, index) => window.setTimeout(() => setDone(index + 1), at));
      if (loopAfterMs > 0) timers.push(window.setTimeout(play, loopAfterMs));
    };
    play();
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [inView, reduced, steps, loopAfterMs]);

  return done;
}
