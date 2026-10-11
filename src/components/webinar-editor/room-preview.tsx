import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { Headset, MessagesSquare, Play, RotateCcwSquare, ShoppingCart, X } from "lucide-react";
import { VideoPlayer } from "@/components/video-player";
import { PreliveCountdown } from "@/components/prelive-countdown";
import { chatEcho, placeOf, type ChatPerson } from "@/lib/chat-reactions";
import { useSimulatedHearts } from "@/lib/room-hearts";
import { cn } from "@/lib/utils";
import {
  activeOffer,
  clock,
  FOLLOW_NETWORKS,
  followMomentAt,
  followWebLink,
  isGroupLink,
  LIVE_DEFAULTS,
  offerCountdownLeft,
  offerDeadlinePassed,
  offerTimer,
  profileHandle,
  type FollowNetwork,
  type LiveSettings,
  type OfferSlot,
} from "@/lib/room-logic";
import {
  FollowButton,
  LIVE_FEED_LINES,
  LIVE_SCRIM,
  LiveBadge,
  LiveComposer,
  LiveFeed,
  LiveFollowSheet,
  LiveHeartButton,
  LiveOfferCard,
  LiveOfferSheet,
  LiveOfferSlim,
  LivePanelHead,
  LiveProof,
  LiveStyle,
  LiveSupportSheet,
  LiveTopBar,
  LiveViewers,
  liveOfferVars,
  SupportMessages,
  type LiveFeedItem,
  type LiveOffer,
  type LiveSupportMessage,
} from "@/components/room/live-parts";
import { LessonTimer } from "@/components/room/lesson-timer";
import { ROOM_FONT } from "@/components/room/entry-screen";
import { SCREENS, TABLET_WIDE } from "./preview";
import {
  CaptionLine,
  ChatComposer,
  ChatLine,
  ChatPin,
  ChatToggle,
  ENTRY_DIM,
  EntryPlay,
  FullscreenButton,
  LIVE_COLUMN_BG,
  LIVE_CONTAIN,
  liveFrame,
  OfferCard,
  PulseDot,
  RoomPartsStyle,
  RoomTabs,
  RoomTitle,
  SALE_TOAST_SPOT,
  SaleLine,
  SaleToast,
  SupportNotice,
  TurnHint,
  VideoSettings,
  type Appearance,
  type Reaction,
} from "@/components/room/room-parts";

/**
 * A sala ao vivo no segundo `t` do relógio do editor, ao tamanho real (computador 1280×720,
 * tablet 820×1180, telemóvel 393×852 ao alto ou 852×393 deitado). Usa o leitor e as peças da sala pública:
 * o que se vê aqui é o que as pessoas vêem.
 */

export type RoomTab = "chat" | "support" | "offer";
export type PreviewComment = { id: string; at: number; author: string; message: string; agent?: boolean };
export type PreviewSale = { id: string; at: number; buyer: string; product: string };
export type PreviewMine = { at: number; text: string; tab: "chat" | "support" };
export type PreviewDevice = "desktop" | "tablet" | "tablet-landscape" | "phone" | "phone-landscape";

/** O ecrã ao alto: telemóvel ou tablet (a sala é a mesma, com outro tamanho e outra barra de estado). */
function tallScreen(device: PreviewDevice) {
  return device === "tablet" ? SCREENS.tablet : SCREENS.phone;
}

export type RoomPreviewProps = {
  device: PreviewDevice;
  theme: "dark" | "light";
  appearance: Appearance;
  onAppearance: (appearance: Appearance) => void;
  t: number;
  playing: boolean;
  onTogglePlay: () => void;
  duration: number;
  video: { url: string | null; provider: string | null };
  volume: number;
  onVolume: (volume: number) => void;
  captionsOn: boolean;
  onCaptions: (on: boolean) => void;
  speech: readonly { at: number; text: string }[];
  title: string;
  host: { name: string; role: string; avatarUrl: string; verified: boolean };
  viewers: number | null;
  pin: string;
  comments: readonly PreviewComment[];
  sales: readonly PreviewSale[];
  salesWhere: "chat" | "video" | "both";
  /** A cor das compras (Vendas). */
  saleColor?: string | null | undefined;
  offers: readonly OfferSlot[];
  offerImageUrl?: string | undefined;
  /** O último dia da oferta principal já passou. */
  offerClosed: boolean;
  /** «O botão fecha» no zero do cronómetro (senão, no zero só o cronómetro sai). */
  offerCloseAtZero?: boolean | undefined;
  /** O fuso do webinar: o último dia de cada oferta seguinte acaba à meia-noite dele, como na sala. */
  offerTimezone?: string | undefined;
  agent: { on: boolean; name: string };
  tab: RoomTab;
  onTab: (tab: RoomTab) => void;
  /** Mostra o separador Oferta antes de abrir, com o aviso do minuto. */
  forceOffer?: boolean | undefined;
  highlight?: string | null | undefined;
  mine: readonly PreviewMine[];
  onSend: (text: string, tab: "chat" | "support") => void;
  reactions: readonly Reaction[];
  onHeart: () => void;
  onBuy?: (() => void) | undefined;
  /** Formato Live: o vídeo com o chat por cima no telemóvel, e o chat num painel ao lado no computador. */
  live?: boolean | undefined;
  /** As opções da sala, iguais nos dois formatos: redes, momentos do + Seguir, cor do botão e aviso. */
  liveSettings?: LiveSettings | undefined;
  /** A forma do vídeo, lida do ficheiro: com o aparelho, decide onde o vídeo fica (regras fixas, como na sala). */
  videoShape?: LiveSettings["desk"] | null | undefined;
  /** Em pausa, mostra o botão de entrar da sala (no passo Vídeo, onde se escolhe); nos outros, só um play discreto. */
  entryShown?: boolean | undefined;
};

/**
 * A contagem antes de começar, na pré-visualização: o passo Vídeo mostra-a no lugar do vídeo enquanto
 * se escolhe o estilo, a cor e os minutos (`peekCountdown`), e esconde-a ao sair.
 */
let countdownPeek = false;
const peekListeners = new Set<() => void>();
export function peekCountdown(on: boolean) {
  if (countdownPeek === on) return;
  countdownPeek = on;
  peekListeners.forEach((listener) => listener());
}
export function useCountdownPeek() {
  return useSyncExternalStore(
    (listener) => {
      peekListeners.add(listener);
      return () => peekListeners.delete(listener);
    },
    () => countdownPeek,
    () => false,
  );
}

/** A contagem a descer na pré-visualização, a partir dos minutos escolhidos (sem som). */
function PeekCountdown({ live, fill }: { live: LiveSettings; fill?: boolean }) {
  const total = (live.countdown?.minutes ?? 5) * 60;
  const [left, setLeft] = useState(total - 8);
  useEffect(() => setLeft(total - 8), [total]);
  useEffect(() => {
    const timer = window.setInterval(() => setLeft((n) => (n > 1 ? n - 1 : total)), 1000);
    return () => window.clearInterval(timer);
  }, [total]);
  return (
    <div className={cn("absolute inset-0 z-[6] bg-black", !fill && "grid place-items-center")}>
      <PreliveCountdown
        remaining={left}
        total={total}
        message=""
        soundOn={false}
        soundEnabled={false}
        template={live.countdown?.style}
        color={live.countdown?.color}
        fill={fill}
      />
    </div>
  );
}

/** Na pré-visualização, o botão de entrar aparece no passo onde se escolhe ou no início do vídeo. */
const showsEntry = (props: RoomPreviewProps) => Boolean(props.entryShown) || props.t < 1;

/**
 * Em pausa: o botão de entrar só no passo onde se escolhe, ou no início do vídeo (é aí que as pessoas o
 * vêem); a meio da sessão, um play discreto, porque na sala esse botão nunca aparece a meio.
 */
function PausedPlay({ props, compact, big }: { props: RoomPreviewProps; compact: boolean; big?: boolean }) {
  const live = props.liveSettings ?? LIVE_DEFAULTS;
  if (showsEntry(props)) return <EntryPlay look={live.entry} kicker="Aula ao vivo" compact={compact} />;
  return (
    <span className={cn("grid place-items-center rounded-full bg-black/55 backdrop-blur", big ? "size-[76px]" : compact ? "size-12" : "size-14")}>
      <Play className={cn("fill-white text-white", big ? "size-8" : compact ? "size-5" : "size-6")} />
    </span>
  );
}

/** As redes de quem apresenta e o + Seguir (só nos momentos escolhidos e fora da oferta), nos dois formatos. */
function useFollow(props: RoomPreviewProps, offerOpen: boolean) {
  const [open, setOpen] = useState(false);
  const [tapped, setTapped] = useState<Partial<Record<FollowNetwork, boolean>>>({});
  const live = props.liveSettings ?? LIVE_DEFAULTS;
  const networks = FOLLOW_NETWORKS.filter((n) => live.links[n.id]).map((n) => {
    const web = followWebLink(n.id, live.links[n.id] ?? "");
    return { id: n.id, name: n.name, handle: profileHandle(web), href: web, done: Boolean(tapped[n.id]) };
  });
  const label = networks.length === 1 && networks[0]?.id === "youtube" ? "Subscrever" : "Seguir";
  const show = () => setOpen(true);
  // Como na sala: quem tocou numa rede e fechou deixa de ver o + Seguir, se a opção estiver ligada.
  const [followed, setFollowed] = useState(false);
  const follow =
    networks.length > 0 && !offerOpen && !(followed && live.hideFollowed) && followMomentAt(live.moments, props.t) ? { label, onClick: show } : null;
  const host = { name: props.host.name, avatarUrl: props.host.avatarUrl, verified: props.host.verified };
  const sheet = open ? (
    <LiveFollowSheet
      host={host}
      networks={networks}
      note={props.device === "desktop" ? "Cada rede abre numa janela pequena ao lado. A aula continua aqui." : "Cada rede abre diretamente na app. A aula continua aqui."}
      onClose={() => {
        if (networks.some((n) => n.done)) setFollowed(true);
        setOpen(false);
      }}
      onTap={(id) => setTapped((prev) => ({ ...prev, [id]: true }))}
    />
  ) : null;
  return { follow, onHost: networks.length ? show : undefined, sheet, host };
}

/** O que a sala mostra no segundo t: a oferta aberta, a compra a aparecer e a frase dita. */
function roomMoment(props: RoomPreviewProps) {
  const open = activeOffer(props.offers, props.t);
  // O vídeo acabou: o fim da transmissão. Se a oferta fecha depois, a sala fica aberta para compras.
  const videoEnded = props.duration > 0 && props.t >= props.duration - 0.5;
  const afterVideo = videoEnded && open !== null && (open.end ?? 0) > props.duration;
  // No separador Oferta do editor, mostra-se a primeira oferta mesmo antes de abrir.
  const shown = open ?? (props.forceOffer ? props.offers[0] ?? null : null);
  const tab: RoomTab = props.tab === "offer" && !shown ? "chat" : props.tab;
  const lastSale =
    props.salesWhere === "chat" ? undefined : [...props.sales].reverse().find((s) => s.at <= props.t && props.t - s.at < 8);
  return { open, afterVideo, videoEnded, shown, tab, lastSale };
}

/**
 * O fim da transmissão, igual à sala pública (as mesmas letras, no fundo preto): «Transmissão terminou» ou, com a
 * oferta a fechar depois do vídeo (`left`, em segundos), «As inscrições continuam abertas» com o tempo que falta.
 * `strip`: na faixa 16:9 do Live empilhado (letras menores); `big`: ecrã com 640 px ou mais de largura (o `sm:` da sala).
 */
function EndScreen({ strip, big, left, offer, onOffer }: { strip?: boolean; big: boolean; left: number | null; offer: string | null; onOffer: () => void }) {
  const kicker = "text-[12px] font-bold uppercase tracking-[0.22em] text-primary";
  const heading = cn("font-extrabold text-white", strip ? "text-[17px] leading-tight" : big ? "text-3xl" : "text-2xl");
  const two = (n: number) => String(n).padStart(2, "0");
  return (
    <div
      className={cn(
        "absolute inset-0 z-[5] flex flex-col items-center justify-center bg-black text-center text-white",
        strip ? (left !== null ? "gap-1" : "gap-1.5") + " px-4 pb-2 pt-12" : left !== null ? "gap-3 px-6" : "gap-4 px-6",
      )}
    >
      {left !== null ? (
        <>
          <p className={kicker}>A aula terminou</p>
          <h2 className={heading}>As inscrições continuam abertas</h2>
          <p className={cn("font-mono font-bold tabular-nums text-white", strip ? "text-[22px]" : big ? "text-4xl" : "text-3xl")}>
            {two(Math.floor(left / 3600))}:{two(Math.floor((left % 3600) / 60))}:{two(left % 60)}
          </p>
          {strip ? (
            <p className="text-[12px] text-white/80">A oferta está aqui em baixo.</p>
          ) : (
            <>
              <p className="max-w-md text-sm text-white/80">Garanta a sua vaga no separador Oferta. Dúvidas? A equipa responde no Suporte.</p>
              <button type="button" onClick={onOffer} className="mt-1 h-11 rounded-xl bg-primary px-5 text-[15px] font-bold text-primary-foreground transition hover:brightness-110">
                Ver a oferta
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <p className={kicker}>Transmissão terminou</p>
          <h2 className={heading}>Obrigado por ter estado connosco</h2>
          <p className={cn("max-w-md text-white/80", strip ? "text-[12px]" : "text-sm")}>A sessão ao vivo chegou ao fim. {offer ?? "Volte para a próxima sessão."}</p>
        </>
      )}
    </div>
  );
}

/** Quanto falta para a oferta fechar depois do vídeo (a sala fica aberta para compras até lá). */
function leftAfter(props: Pick<RoomPreviewProps, "t" | "duration">, open: OfferSlot | null) {
  return Math.max(0, Math.round((open?.end ?? props.duration) - Math.max(props.t, props.duration)));
}

/**
 * A oferta mostrada no segundo t, como na sala (`offerTimer`): o tempo que falta, se o cronómetro ainda
 * se vê e se o botão já fechou, no zero ou no último dia (o da principal ou o de cada oferta seguinte).
 */
type OfferProps = Pick<RoomPreviewProps, "t" | "offerClosed" | "offerCloseAtZero" | "offerTimezone" | "offerImageUrl" | "liveSettings">;
function offerNow(props: OfferProps, shown: OfferSlot | null) {
  if (!shown) return { seconds: 0, left: null, closed: false };
  const seconds = offerCountdownLeft(shown.countdown, shown.start, props.t);
  const zone = props.offerTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const deadline = shown.id === "main" ? props.offerClosed : offerDeadlinePassed(shown.deadline, zone, Date.now());
  return { seconds, ...offerTimer(shown.countdown, seconds, Boolean(props.offerCloseAtZero), deadline) };
}

/** O cartão da oferta (Live, e Webinar no telemóvel ao alto), na forma escolhida. */
function cardOffer(props: OfferProps, shown: OfferSlot | null): LiveOffer | null {
  if (!shown) return null;
  const now = offerNow(props, shown);
  return {
    product: shown.product,
    priceFrom: shown.priceFrom,
    priceNow: shown.priceNow,
    button: shown.button || "Quero minha vaga",
    countdown: now.left,
    closed: now.closed,
    image: shown.id === "main" ? props.offerImageUrl : null,
    look: (props.liveSettings ?? LIVE_DEFAULTS).offerLook,
    colors: props.liveSettings?.offerColors,
    group: isGroupLink(shown.url),
  };
}

/** No editor, o Suporte mostra um exemplo: a pergunta de uma pessoa, a resposta do Agente e o que se escreveu. */
function supportExample(props: Pick<RoomPreviewProps, "agent" | "mine">, offer: OfferSlot | null): LiveSupportMessage[] {
  return [
    { key: "q", text: "Qual é o preço da vaga?", fromTeam: false },
    ...(props.agent.on
      ? [
          {
            key: "a",
            fromTeam: true,
            text: offer?.priceNow
              ? `A vaga está por ${offer.priceNow}${offer.priceFrom ? ` em vez de ${offer.priceFrom}` : ""}, enquanto a oferta estiver aberta.`
              : "Os valores aparecem na oferta quando ela abrir.",
          },
        ]
      : []),
    ...props.mine.filter((m) => m.tab === "support").map((m, i) => ({ key: `m${i}`, text: m.text, fromTeam: false })),
  ];
}

/**
 * As últimas mensagens do chat no segundo t: comentários, compras e o que se escreveu. Ao que se escreve,
 * o chat simulado reage e às vezes responde, como na sala (`chatEcho`).
 */
function chatItemsAt(props: Pick<RoomPreviewProps, "comments" | "sales" | "salesWhere" | "mine" | "t">, limit: number) {
  const crowd: ChatPerson[] = [...new Set(props.comments.filter((c) => !c.agent).map((c) => c.author))].map((name) => ({
    name,
    place: props.comments.map((c) => (c.author === name ? placeOf(c.message) : "")).find(Boolean) ?? "",
  }));
  const mine = props.mine
    .map((m, i) => ({ m, i, echo: chatEcho({ id: `previa-${i}-${m.at}`, text: m.text, author: "" }, crowd) }))
    .filter(({ m }) => m.tab === "chat" && m.at <= props.t + 1);
  return [
    ...props.comments.filter((c) => c.at <= props.t).map((c) => ({ key: c.id, at: c.at, kind: "msg" as const, c })),
    ...(props.salesWhere === "video" ? [] : props.sales)
      .filter((s) => s.at <= props.t)
      .map((s) => ({ key: `s-${s.id}`, at: s.at, kind: "sale" as const, s })),
    ...mine.map(({ m, i, echo }) => ({
      key: `m-${i}`,
      at: m.at,
      kind: "mine" as const,
      m,
      reaction: echo.reaction && props.t >= m.at + echo.reaction.after ? `${echo.reaction.emoji} ${echo.reaction.count}` : undefined,
    })),
    ...mine.flatMap(({ m, i, echo }) =>
      echo.replies
        .filter((r) => props.t >= m.at + r.after)
        .map((r, j) => ({ key: `m-${i}-r${j}`, at: m.at + r.after, kind: "msg" as const, c: { id: `m-${i}-r${j}`, at: m.at + r.after, author: r.author, message: r.text, agent: false } })),
    ),
  ]
    .sort((a, b) => a.at - b.at)
    .slice(-limit);
}

/** As mensagens no desenho do chat por cima do vídeo (o Live, e o chat oculto nos dois formatos). */
function feedItemsAt(props: Parameters<typeof chatItemsAt>[0] & { saleColor?: string | null | undefined }, limit: number): LiveFeedItem[] {
  return chatItemsAt(props, limit).map((item) =>
    item.kind === "sale"
      ? { key: item.key, kind: "sale", text: `${item.s.buyer} comprou ${item.s.product}`, color: props.saleColor }
      : item.kind === "mine"
        ? { key: item.key, kind: "mine", name: "Ana Costa", text: item.m.text, reaction: item.reaction }
        : { key: item.key, kind: "msg", author: item.c.author, text: item.c.message },
  );
}

export function RoomPreview(props: RoomPreviewProps) {
  // Os corações simulados da sala (ver room-hearts), juntos aos que se tocam aqui.
  const sim = useSimulatedHearts(props.t, props.title, activeOffer(props.offers, props.t) !== null);
  const room = { ...props, reactions: [...props.reactions, ...sim] };
  if (props.live) return <LivePreview {...room} />;
  return <WebinarPreview {...room} />;
}

/** O formato Webinar: o vídeo deitado e o chat ao lado (no telemóvel, por baixo). */
function WebinarPreview(props: RoomPreviewProps) {
  const phone = props.device === "phone" || props.device === "phone-landscape";
  const landscape = props.device === "phone-landscape";
  // O tablet usa as peças do computador (letra e botões do tamanho certo): ao alto, uma por baixo da
  // outra; deitado, o vídeo e o chat lado a lado.
  const tablet = props.device === "tablet";
  const tabletWide = props.device === "tablet-landscape";
  // Como na sala: no computador e no tablet deitado o chat também se oculta no X dos separadores.
  const desk = props.device === "desktop" || tabletWide;
  const hl = (key: string) =>
    props.highlight === key ? "outline outline-2 outline-offset-4 outline-[#E8440C] shadow-[0_0_0_10px_rgba(232,68,12,.25)]" : "";
  const { open, afterVideo, videoEnded, shown, tab, lastSale } = roomMoment(props);
  const live = props.liveSettings ?? LIVE_DEFAULTS;
  const peek = useCountdownPeek() && Boolean(live.countdown?.on);
  const social = useFollow(props, Boolean(open));
  // Deitado, como na sala: o chat numa coluna ao lado do vídeo; oculta-se no X e volta no botão (abre
  // também quando o editor mostra outro separador). Oculto, as mensagens, os corações e a oferta ficam
  // por cima do vídeo (`proof`).
  const [side, setSide] = useState(true);
  const [proofMin, setProofMin] = useState(false);
  useEffect(() => {
    if (props.tab !== "chat") setSide(true);
  }, [props.tab]);
  // Como na sala: no telemóvel deitado (vídeo horizontal) a oferta chega como barra; a seta abre o cartão.
  useEffect(() => setProofMin(landscape && props.videoShape !== "vertical"), [shown?.id, landscape, props.videoShape]);
  // Como na sala: o botão de comentar mostra a coluna do chat e põe logo o foco na caixa de escrever.
  const roomBox = useRef<HTMLDivElement>(null);
  const openChatToWrite = () => {
    flushSync(() => {
      setSide(true);
      if (props.tab === "offer") props.onTab("chat");
    });
    roomBox.current?.querySelector<HTMLInputElement>("form input")?.focus();
  };
  // O ecrã inteiro (telemóvel ao alto, vídeo horizontal, opção ligada): aqui o toque só mostra a dica de virar.
  const [turnHint, setTurnHint] = useState(false);
  useEffect(() => {
    if (!turnHint) return;
    const timer = window.setTimeout(() => setTurnHint(false), 2500);
    return () => window.clearTimeout(timer);
  }, [turnHint]);
  // Vídeo ao alto com o telemóvel deitado: o vídeo não roda (fica ao alto, com a altura toda) e não há
  // chat; as mensagens, os corações e a oferta ficam ao lado do vídeo, como com o chat oculto.
  const vertical = landscape && props.videoShape === "vertical";
  const hidden = (landscape || desk) && (!side || vertical);
  // Como na sala: quando a oferta abre durante a aula, o separador dela passa para a frente (no telemóvel ao
  // alto, o cartão sobe por cima do chat; com o chat oculto, a oferta já está por cima do vídeo).
  const openId = open?.id;
  useEffect(() => {
    if (openId && props.playing && !(phone && !landscape) && !hidden) props.onTab("offer");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);
  // Em pausa com o botão de entrar à frente, a sala ainda não mostra o ⚙ (só depois do toque).
  const entering = showsEntry(props) && !props.playing && Boolean(props.video.url);
  const fullscreenShown = (props.device === "phone" || props.device === "tablet") && live.fullscreenButton !== false && props.videoShape !== "vertical";
  const followButton = (big: boolean) => (social.follow ? <FollowButton big={big} label={social.follow.label} onClick={social.follow.onClick} /> : null);
  // Como na sala: o aviso de compra no canto de baixo do vídeo (`SALE_TOAST_SPOT`); a legenda sobe por cima dele.
  // Com o chat oculto, vai por cima das mensagens; aí, com as compras também no chat, a linha do chat já é o aviso.
  const saleToast = lastSale && !(hidden && props.salesWhere !== "video") ? (
    <SaleToast
      key={lastSale.id}
      name={lastSale.buyer}
      text={`comprou ${lastSale.product}`}
      color={props.saleColor}
      compact={phone}
      className={hidden ? SALE_TOAST_SPOT.feed : phone ? SALE_TOAST_SPOT.phone : SALE_TOAST_SPOT.desk}
    />
  ) : null;
  const proofOffer = hidden ? cardOffer(props, shown) : null;
  const proof =
    hidden ? (
      <LiveProof
        items={feedItemsAt(props, 8)}
        toast={saleToast}
        caption={props.captionsOn ? <CaptionLine lines={props.speech} t={props.t} compact={phone} flow /> : null}
        // Com o vídeo ao alto deitado, o coração fica do outro lado do vídeo (no canto de baixo à direita).
        onHeart={vertical ? undefined : props.onHeart}
        reactions={props.reactions}
        // O botão de voltar a comentar junto do coração, no canto de baixo à direita (como na sala).
        comment={vertical ? null : <ChatToggle open={false} onToggle={openChatToWrite} alert={Boolean(shown)} />}
        // Ao lado do vídeo ao alto, no fundo da sala: nas cores do tema, sem o escurecido.
        panel={vertical}
        offer={
          proofOffer ? (
            proofMin ? (
              <LiveOfferSlim offer={proofOffer} onOpen={() => setProofMin(false)} />
            ) : (
              <LiveOfferCard
                offer={proofOffer}
                onBuy={() => props.onBuy?.()}
                onMinimize={() => setProofMin(true)}
                // Com o vídeo ao alto deitado não há painel: a oferta fica no cartão.
                onExpand={
                  vertical
                    ? undefined
                    : () => {
                        setSide(true);
                        props.onTab("offer");
                      }
                }
                panel={vertical}
              />
            )
          ) : null
        }
      />
    ) : null;

  const videoCard = (
    <div
      className={cn(
        "relative overflow-hidden",
        // Como na sala: no tema claro, o fundo do vídeo (enquanto carrega) é o da superfície da sala.
        props.theme === "light" ? "bg-room-surface" : "bg-black",
        vertical ? "size-full" : "aspect-video w-full",
        !phone && "room-panel rounded-2xl ring-1 ring-room-line",
      )}
    >
      {props.video.url ? (
        <PreviewPlayer
          url={props.video.url}
          provider={props.video.provider}
          t={props.t}
          playing={props.playing}
          volume={props.volume}
          ambient={showsEntry(props)}
        />
      ) : (
        <div className="absolute inset-0 grid content-center gap-3 bg-[radial-gradient(120%_90%_at_85%_10%,rgba(232,68,12,.2),transparent_55%),linear-gradient(160deg,#22262e,#111316)] px-[8%] text-white">
          <p className={cn("font-bold uppercase tracking-[0.16em] text-[#F28E63]", phone ? "text-[12px]" : "text-[15px]")}>
            Sem vídeo
          </p>
          <p className={cn("max-w-[640px] font-extrabold leading-[1.1] tracking-tight", phone ? "text-[20px]" : "text-[44px]")}>
            Escolha o vídeo na etapa Vídeo
          </p>
        </div>
      )}
      {/* Como na sala: no canto de cima, a 12 px (dentro da zona segura), por cima de tudo (também do véu da entrada e da prova). */}
      <div className="pointer-events-none absolute left-[calc(var(--safe-l,0px)+12px)] top-3 z-[41] flex items-center gap-[5px]">
        {/* Como na sala: no fim, «Terminou» a cinzento e sem o número. */}
        <LiveBadge {...(videoEnded ? { label: "Terminou", tone: "muted" as const } : {})} />
        {props.viewers !== null && !videoEnded ? (
          <span className={hl("viewers")}>
            <LiveViewers count={props.viewers} />
          </span>
        ) : null}
      </div>
      {/* Com o vídeo ao alto deitado, a prova fica ao lado do vídeo (com o aviso de compra). Dentro das zonas seguras. */}
      {vertical ? null : (
        <div className="pointer-events-none absolute inset-y-0 left-[var(--safe-l,0px)] right-[var(--safe-r,0px)] z-20">{proof ?? saleToast}</div>
      )}
      {props.captionsOn && !proof ? <CaptionLine lines={props.speech} t={props.t} compact={phone} raised={Boolean(lastSale)} /> : null}
      {videoEnded ? (
        <EndScreen
          big={props.device !== "phone"}
          left={afterVideo && !offerNow(props, open).closed ? leftAfter(props, open) : null}
          offer={open && !props.offerClosed ? "A oferta continua disponível no separador Oferta." : null}
          onOffer={() => {
            setSide(true);
            props.onTab("offer");
          }}
        />
      ) : null}
      <button
        type="button"
        onClick={props.onTogglePlay}
        aria-label={props.playing ? "Pausar" : "Tocar"}
        className="absolute inset-0"
      >
        {!props.playing && props.video.url ? (
          <span className={cn("absolute inset-0 grid place-items-center", showsEntry(props) && ENTRY_DIM)}>
            <PausedPlay props={props} compact={phone} big={!phone} />
          </span>
        ) : null}
      </button>
      {/* O temporizador da aula (também em pausa, para se ver ao escolher). */}
      {props.video.url && !videoEnded ? (
        <LessonTimer
          timer={live.timer}
          seconds={props.t}
          compact={phone}
          bar="absolute inset-x-0 bottom-0"
          chip={cn("absolute top-3", hidden && !vertical ? "right-[calc(var(--safe-r,0px)+64px)]" : "right-[calc(var(--safe-r,0px)+12px)]")}
        />
      ) : null}
      {peek ? <PeekCountdown live={live} /> : null}
      {turnHint ? <TurnHint /> : null}
      {/* Com as mensagens por cima do vídeo, o canto de baixo à direita é do botão de comentar e do coração:
          o ⚙ sobe para o canto de cima. Como na sala, o mesmo ⚙ em todos os aparelhos; no telemóvel ao alto com o
          vídeo horizontal, o ecrã inteiro à esquerda dele (aqui só mostra a dica de virar, como no iPhone). */}
      <div className={cn("absolute right-[calc(var(--safe-r,0px)+12px)] flex items-center gap-1", hidden && !vertical ? "top-3" : "bottom-3", (entering || videoEnded) && "hidden")}>
        {fullscreenShown ? <FullscreenButton on={false} onToggle={() => setTurnHint(true)} /> : null}
        <VideoSettings
          volume={props.volume}
          onVolume={props.onVolume}
          captions={props.captionsOn}
          onCaptions={props.onCaptions}
          hasCaptions={props.speech.length > 0}
          appearance={props.appearance}
          onAppearance={props.onAppearance}
        />
      </div>
    </div>
  );

  const roomClass = cn(
    "room-ambient text-room-text",
    props.theme === "light" && "room-light",
    landscape
      ? "flex h-[393px] w-[852px]"
      : phone
        ? "flex flex-col"
        : tablet
          ? "relative flex flex-col gap-1 px-6 pb-6"
          : tabletWide
            ? cn("relative grid gap-6 px-6 pb-6", hidden ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_380px]")
            : cn("grid h-[720px] w-[1280px] gap-6 p-6", hidden ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_380px]"),
  );
  const tall = tallScreen(props.device);

  const style = {
    fontFamily: ROOM_FONT,
    ...liveOfferVars(live.offerColor),
    ...(phone && !landscape ? { width: tall.w, height: tall.h } : null),
    ...(tablet ? { width: tall.w, height: tall.h, paddingTop: tall.top + 20 } : null),
    ...(tabletWide ? { width: TABLET_WIDE.w, height: TABLET_WIDE.h, paddingTop: TABLET_WIDE.top + 16 } : null),
  };
  if (landscape && vertical) {
    // Como na sala (`turnUp`): vídeo ao alto e telemóvel deitado, o vídeo fica ao alto, ao centro, com a altura
    // toda; à esquerda, no fundo da sala, as mensagens, os corações e a oferta; à direita, o aviso para virar o
    // telemóvel. Sem caixa de escrever (roda-se para comentar).
    return (
      <div className={cn(roomClass, "relative")} style={style}>
        <RoomPartsStyle />
        <LiveStyle />
        <div className="flex min-w-0 flex-1 bg-room-bg px-[59px] [container-type:size]">
          <div className="relative min-w-0 flex-1">{proof}</div>
          <div className="h-full w-[56.25cqh] shrink-0">{videoCard}</div>
          <div className="relative grid min-w-0 flex-1 place-items-center px-5">
            <p className="flex max-w-[230px] flex-col items-center gap-2 text-center text-[13px] leading-snug text-room-subtle">
              <RotateCcwSquare className="size-6" strokeWidth={1.75} />
              Para uma melhor experiência, vire o telemóvel ao alto.
            </p>
            {/* O coração no canto de baixo à direita (fora da prova, que fica do outro lado). */}
            <span className="absolute bottom-3 right-3">
              <LiveHeartButton onHeart={props.onHeart} reactions={props.reactions} panel />
            </span>
          </div>
        </div>
      </div>
    );
  }
  if (landscape) {
    // Deitado, como na sala (e como no Twitch): o vídeo à esquerda e o chat do outro lado, numa coluna que não o
    // tapa (300 px + a zona segura). O vídeo vai até à borda do ecrã (por baixo da ilha da câmara) e até à coluna;
    // à volta dele, o fundo do chat (só a borda os separa). O que fica por cima do vídeo respeita as zonas seguras
    // do iPhone deitado (59 px), menos a folga do vídeo ao centro (`--safe-l/r`, cq = esta área).
    return (
      <div ref={roomBox} className={cn(roomClass, "relative")} style={style}>
        <RoomPartsStyle />
        <LiveStyle />
        <div className="grid min-w-0 flex-1 place-items-center bg-room-bg [container-type:size]">
          <div
            className={cn(
              "w-[min(100cqw,177.78cqh)] [--safe-l:max(0px,calc(59px_-_(100cqw_-_min(100cqw,177.78cqh))_/_2))]",
              !side && "[--safe-r:max(0px,calc(59px_-_(100cqw_-_min(100cqw,177.78cqh))_/_2))]",
            )}
          >
            {videoCard}
          </div>
        </div>
        {side ? (
          <div className="relative flex w-[359px] shrink-0 flex-col border-l border-room-line/60 bg-room-bg pr-[59px]">
            <Panel {...props} tab={tab} shown={shown} open={open} hl={hl} phone={phone} tight afterVideo={afterVideo} notice={live.notify && props.agent.on} onClose={() => setSide(false)} />
            {social.sheet}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    // A barra de estado (relógio, rede, bateria) é sempre preta na sala, em qualquer tema, como no telemóvel:
    // o vídeo fica logo por baixo. O tema muda o resto (título, chat e fundo).
    <div ref={roomBox} className={roomClass} style={style} data-status-dark>
      <RoomPartsStyle />
      <LiveStyle />
      {tablet || tabletWide ? <div aria-hidden className="absolute inset-x-0 top-0 bg-black" style={{ height: SCREENS.tablet.top }} /> : null}
      {/* O título e quem apresenta só se estiverem ligados (Vídeo); no telemóvel, a seta recolhe-os numa linha. */}
      {phone ? (
        <>
          <div className="shrink-0 bg-black" style={{ height: tall.top }} />
          {videoCard}
          {live.header !== false ? (
            <RoomTitle compact foldable kicker="" title={props.title} host={props.host} highlight={props.highlight} follow={followButton(false)} onHost={social.onHost} />
          ) : null}
        </>
      ) : (
        <div
          className={cn("min-w-0", hidden && "w-full justify-self-center")}
          // Como na sala: com o chat oculto, o vídeo cresce até caber na altura do ecrã (100dvh − 11rem), ao centro.
          style={hidden ? { maxWidth: ((tabletWide ? TABLET_WIDE.h : 720) - 176) * (16 / 9) } : undefined}
        >
          {videoCard}
          {live.header !== false ? (
            <div className="px-1">
              <RoomTitle kicker={videoEnded ? "Sessão terminada" : "Sessão ao vivo"} title={props.title} host={props.host} highlight={props.highlight} follow={followButton(true)} onHost={social.onHost} />
            </div>
          ) : null}
        </div>
      )}
      {hidden ? null : (
        <div className={cn("relative flex min-h-0 flex-col", phone ? "flex-1" : tablet ? "mt-4 flex-1 overflow-hidden rounded-2xl" : "overflow-hidden rounded-2xl")}>
          {/* No tema claro, o painel e o vídeo ganham uma borda que se vê (como no YouTube): `room-panel`. */}
          <Panel
            {...props}
            tab={tab}
            shown={shown}
            open={open}
            hl={hl}
            phone={phone}
            afterVideo={afterVideo}
            notice={live.notify && props.agent.on}
            onClose={desk ? () => setSide(false) : undefined}
          />
          {social.sheet}
        </div>
      )}
    </div>
  );
}

/**
 * A sala em formato Live, com as mesmas peças da sala pública: no telemóvel o vídeo enche o ecrã e
 * o chat fica por cima; no computador o vídeo (16:9 ou 9:16) tem o chat num painel ao lado.
 */
function LivePreview(props: RoomPreviewProps) {
  const [text, setText] = useState("");
  const [offerMin, setOfferMin] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const live = props.liveSettings ?? LIVE_DEFAULTS;
  // O tablet ao alto é como o telemóvel (chat por cima do vídeo); deitado, como o computador.
  const phone = props.device === "phone" || props.device === "phone-landscape" || props.device === "tablet";
  const landscape = props.device === "phone-landscape";
  const portrait = phone && !landscape;
  const tablet = props.device === "tablet";
  // Como na sala: no tablet (ao alto ou deitado) o chat tem letra e caixa maiores.
  const bigChat = tablet || props.device === "tablet-landscape";
  const tall = tallScreen(props.device);
  // No tablet ao alto, o topo encosta às margens e o chat fica numa coluna à esquerda, à escala de um
  // telemóvel; a linha de escrever vai de margem a margem (o coração no canto de baixo à direita).
  const column = tablet ? "inset-x-5" : "inset-x-3";
  // Como na sala: o vídeo deitado num ecrã ao alto empilha-se (vídeo em cima, chat e caixa de escrever
  // por baixo, no tema da sala); o vídeo ao alto continua a encher o ecrã.
  const stack = portrait && props.videoShape !== "vertical";
  const themed = !phone || stack;
  const hl = (key: string) =>
    props.highlight === key ? "outline outline-2 outline-offset-4 outline-[#E8440C] shadow-[0_0_0_10px_rgba(232,68,12,.25)]" : "";
  const { open, afterVideo, videoEnded, shown, lastSale } = roomMoment(props);
  const peek = useCountdownPeek() && Boolean(live.countdown?.on);
  const supportOpen = props.tab === "support";
  const { follow, onHost: openFollow, sheet: followSheet, host } = useFollow(props, Boolean(open));
  useEffect(() => {
    setOfferMin(false);
    setOfferOpen(false);
  }, [shown?.id]);

  const offer = cardOffer(props, shown);
  const cardOpen = Boolean(offer) && !offerMin && !offerOpen;
  // Como na sala: deitado e no computador, o chat oculta-se no botão ao lado do ⚙ (volta no mesmo botão, ou quando
  // o editor mostra outro separador). Oculto, as mensagens, os corações e a oferta ficam por cima do vídeo.
  const [chatOpen, setChatOpen] = useState(true);
  useEffect(() => {
    if (props.tab !== "chat") setChatOpen(true);
  }, [props.tab]);
  const chatHidden = (landscape || !phone) && !chatOpen;
  const chatToggle = (className?: string) => (
    <ChatToggle open={chatOpen} onToggle={() => setChatOpen((o) => !o)} alert={Boolean(open) || (props.agent.on && !supportOpen)} className={className} />
  );
  // Como na sala, a lista desce sempre até à última mensagem (a mais recente junto da caixa de escrever).
  const feedRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = feedRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  });

  const teamName = props.host.name ? `Equipa de ${props.host.name}` : "Equipa";

  // Empilhado, o chat enche o espaço por baixo do vídeo: mais mensagens.
  const feed = feedItemsAt(props, stack ? 20 : 12);
  // O aviso «já respondemos», como exemplo, quando está ligado e o Agente responde.
  if (live.notify && props.agent.on && !supportOpen) feed.push({ key: "notice", kind: "notice" });
  const thread = supportExample(props, shown);

  // Como na sala: no canto de baixo do vídeo, dentro da moldura (`SALE_TOAST_SPOT`); com o vídeo ao alto a encher o
  // ecrã (o chat tapa-lhe o fundo), logo acima das mensagens; com as compras também no chat, a linha do chat já é o aviso.
  // Com o chat oculto, o aviso vai por cima das mensagens que ficam no vídeo.
  const toastOverChat = (portrait && !stack) || chatHidden;
  const saleToast = lastSale && !(toastOverChat && props.salesWhere !== "video") ? (
    <SaleToast
      key={lastSale.id}
      name={lastSale.buyer}
      text={`comprou ${lastSale.product}`}
      color={props.saleColor}
      compact={!tablet && phone}
      className={toastOverChat ? SALE_TOAST_SPOT.feed : !tablet && phone ? SALE_TOAST_SPOT.phone : SALE_TOAST_SPOT.desk}
    />
  ) : null;

  const lower = (
    <>
      <div className={cn("contents", tablet && "flex flex-col", tablet && (stack ? "min-h-0 w-full flex-1" : "w-[min(620px,100%)]"))}>
        {toastOverChat ? saleToast : null}
        <LiveFeed
          feedRef={feedRef}
          items={feed}
          onNotice={() => props.onTab("support")}
          panel={themed}
          big={bigChat}
          className={!phone ? "min-h-0 flex-1 pr-0" : stack ? "min-h-0 flex-1 justify-end overflow-hidden" : landscape ? "min-h-0 flex-1" : cn(LIVE_FEED_LINES, tablet && "max-h-[300px]")}
        />
        {offer && cardOpen ? (
          <div className={hl("pitch")}>
            <LiveOfferCard offer={offer} onBuy={() => props.onBuy?.()} onMinimize={() => setOfferMin(true)} onExpand={() => setOfferOpen(true)} panel={themed} />
          </div>
        ) : null}
        {/* Como na sala: a seta volta a abrir o cartão no mesmo sítio (a folha abre no saco que pisca). */}
        {offer && !cardOpen && !offerOpen ? <LiveOfferSlim offer={offer} onOpen={() => setOfferMin(false)} /> : null}
      </div>
      <LiveComposer
        value={text}
        onChange={setText}
        onSubmit={() => {
          props.onSend(text.trim(), "chat");
          setText("");
        }}
        bag={offer ? { blink: !cardOpen && !offerOpen, onClick: () => setOfferOpen(true) } : null}
        support={{ unread: props.agent.on && !supportOpen ? 1 : 0, open: supportOpen, onClick: () => props.onTab(supportOpen ? "chat" : "support") }}
        onHeart={props.onHeart}
        reactions={props.reactions}
        panel={themed}
        big={bigChat}
      />
    </>
  );

  const sheets = (
    <>
      {supportOpen ? <LiveSupportSheet thread={thread} teamName={teamName} onClose={() => props.onTab("chat")} /> : null}
      {offerOpen && shown ? (
        <LiveOfferSheet
          countdown={offer?.countdown ?? null}
          closed={offer?.closed}
          onClose={() => setOfferOpen(false)}
          onSupport={() => {
            setOfferOpen(false);
            props.onTab("support");
          }}
        >
          <OfferCard
            productName={shown.product}
            imageUrl={shown.id === "main" ? props.offerImageUrl : undefined}
            priceFrom={shown.priceFrom}
            priceNow={shown.priceNow}
            buttonText={shown.button || "Quero minha vaga"}
            onBuy={props.onBuy}
            countdownSeconds={0}
            showCountdown={false}
            closed={offer?.closed}
            group={isGroupLink(shown.url)}
            compact
            look="compact"
            colors={props.liveSettings?.offerColors}
            stickyBuy
          />
        </LiveOfferSheet>
      ) : null}
      {followSheet}
    </>
  );

  // Chat oculto, como na sala: a prova social por cima do vídeo (o gatilho da manada nunca sai do ecrã). Abrir a
  // oferta inteira volta a mostrar o chat, onde a folha dela abre.
  const proof = chatHidden ? (
    <LiveProof
      items={feed}
      toast={saleToast}
      caption={props.captionsOn ? <CaptionLine lines={props.speech} t={props.t} compact={phone} flow /> : null}
      onNotice={() => {
        setChatOpen(true);
        props.onTab("support");
      }}
      onHeart={props.onHeart}
      reactions={props.reactions}
      offer={
        offer ? (
          offerMin ? (
            <LiveOfferSlim offer={offer} onOpen={() => setOfferMin(false)} />
          ) : (
            <LiveOfferCard
              offer={offer}
              onBuy={() => props.onBuy?.()}
              onMinimize={() => setOfferMin(true)}
              onExpand={() => {
                setChatOpen(true);
                setOfferOpen(true);
              }}
            />
          )
        ) : null
      }
    />
  ) : null;

  // A forma do vídeo e o aparelho, com regras fixas, sem cortar nem esticar; igual à sala (`liveFrame`).
  // Com o telemóvel deitado, o vídeo fica inteiro e ao centro.
  const frame = liveFrame(props.videoShape, phone ? "phone" : "desk");
  const videoBox = stack
    ? "absolute inset-0"
    : landscape
      ? frame.place === "fill"
        ? LIVE_CONTAIN
        : "absolute left-1/2 top-1/2 aspect-video w-[min(100cqw,177.78cqh)] -translate-x-1/2 -translate-y-1/2"
      : frame.box;
  // A legenda fica no próprio vídeo; com o vídeo ao alto a encher o ecrã, sobe acima do chat.
  const inVideoCaption = !(frame.place === "fill" && !landscape);
  // No palco, uma moldura igual à do vídeo, por cima dos véus, só para o aviso de compra.
  const frameToast =
    saleToast && !toastOverChat ? <div className={cn(props.video.url ? videoBox : "absolute inset-0", "pointer-events-none z-20 shadow-none")}>{saleToast}</div> : null;
  const video = (
    <>
      {frame.place === "column" && props.video.url ? <div className={LIVE_COLUMN_BG} /> : null}
      {props.video.url ? (
        <div className={videoBox}>
          <PreviewPlayer
            url={props.video.url}
            provider={props.video.provider}
            t={props.t}
            playing={props.playing}
            volume={props.volume}
            fit={frame.fit}
            ambient={showsEntry(props)}
          />
          {props.captionsOn && inVideoCaption && !chatHidden ? <CaptionLine lines={props.speech} t={props.t} compact={phone} raised={Boolean(lastSale)} /> : null}
          {!props.playing ? (
            <span className={cn("absolute inset-0 grid place-items-center", showsEntry(props) && ENTRY_DIM)}>
              <PausedPlay props={props} compact={phone && !tablet} />
            </span>
          ) : null}
        </div>
      ) : (
        <div className="absolute inset-0 grid content-center gap-2 bg-[radial-gradient(120%_90%_at_85%_10%,rgba(232,68,12,.25),transparent_55%),linear-gradient(160deg,#22262e,#111316)] px-[10%] text-white">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#F28E63]">Sem vídeo</p>
          <p className="text-[22px] font-extrabold leading-[1.1] tracking-tight">Escolha o vídeo na etapa Vídeo</p>
        </div>
      )}
      <button type="button" onClick={props.onTogglePlay} aria-label={props.playing ? "Pausar" : "Tocar"} className="absolute inset-0" />
      {peek ? <PeekCountdown live={live} fill={!stack} /> : null}
      {props.captionsOn && !inVideoCaption && !chatHidden ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[55%]">
          <CaptionLine lines={props.speech} t={props.t} compact />
        </div>
      ) : null}
      {stack ? (
        // Empilhado: só um véu leve em cima do vídeo, para o nome se ler (sem faixa nem borda).
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[linear-gradient(180deg,rgba(0,0,0,.22),transparent)]" />
      ) : (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[120px] bg-[linear-gradient(180deg,rgba(0,0,0,.24),rgba(0,0,0,.07)_55%,transparent)]" />
      )}
      {/* O escurecido de baixo só quando o chat está por cima do vídeo (ao alto; deitado, está ao lado). */}
      {portrait && !stack ? <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%]" style={{ background: LIVE_SCRIM }} /> : null}
    </>
  );
  // Como na sala: com o botão de entrar à frente ainda não há ⚙ (só depois do toque).
  const settings = showsEntry(props) && !props.playing && props.video.url ? null : (
    <VideoSettings
      inline
      compact={phone}
      volume={props.volume}
      onVolume={props.onVolume}
      captions={props.captionsOn}
      onCaptions={props.onCaptions}
      hasCaptions={props.speech.length > 0}
      appearance={props.appearance}
      onAppearance={props.onAppearance}
    />
  );
  // O temporizador da aula, nos mesmos sítios que na sala.
  const lessonTimer = (spots: { bar?: string; chip?: string }) =>
    props.video.url && !videoEnded ? <LessonTimer timer={live.timer} seconds={props.t} compact={phone && !tablet} {...spots} /> : null;
  // Como na sala: no fim, «Terminou» a cinzento e sem o número de pessoas.
  const badge = videoEnded ? { label: "Terminou", tone: "muted" as const } : { label: "Ao vivo", tone: "live" as const };
  const corners = (
    <>
      <div className={cn("absolute z-20 flex items-center gap-[5px]", props.video.url ? "left-3 top-3" : "left-5 top-5", hl("viewers"))}>
        <LiveBadge label={badge.label} tone={badge.tone} />
        {props.viewers !== null && !videoEnded ? <LiveViewers count={props.viewers} /> : null}
      </div>
      {/* Como na sala: no canto, o botão de mostrar ou ocultar o painel do chat e o ⚙. */}
      <div className={cn("pointer-events-auto absolute z-30 flex items-center gap-2", props.video.url ? "right-3 top-3" : "right-5 top-5")}>
        {chatToggle()}
        {settings}
      </div>
      {lessonTimer({ bar: "absolute inset-x-0 bottom-0 z-20", chip: "absolute right-3 top-14 z-20" })}
    </>
  );
  const ended = videoEnded ? (
    <EndScreen
      strip={stack}
      big={props.device !== "phone"}
      left={afterVideo && !offer?.closed ? leftAfter(props, open) : null}
      offer={open && !props.offerClosed ? "A oferta continua disponível aqui em baixo." : null}
      onOffer={() => {
        setChatOpen(true);
        setOfferOpen(true);
      }}
    />
  ) : null;
  // `--live-top`: o vídeo deitado encosta logo abaixo da barra de estado do aparelho.
  const style = { fontFamily: ROOM_FONT, ...liveOfferVars(live.offerColor), "--live-top": `${portrait ? tall.top : 0}px` } as CSSProperties;
  const light = props.theme === "light" && "room-light";

  if (stack) {
    // Como na sala (`liveStack`): a zona da câmara a preto; o vídeo a toda a largura, sem borda, com a barra do
    // Live por dentro; por baixo, o chat (cinco linhas) e a caixa de escrever no fundo, no tema da sala.
    return (
      <div className={cn("room-ambient relative flex flex-col overflow-hidden text-room-text", light)} style={{ ...style, width: tall.w, height: tall.h }} data-status-dark>
        <RoomPartsStyle />
        <LiveStyle />
        {/* A barra de estado sempre preta, em qualquer tema (o vídeo fica logo por baixo). */}
        <div className="shrink-0 bg-black" style={{ height: tall.top }} />
        <div className="relative shrink-0">
          <div className="prelive-dark relative aspect-video w-full overflow-hidden bg-black text-white">
            {video}
            {lessonTimer({ bar: "absolute inset-x-0 bottom-0 z-20" })}
            {frameToast}
            {ended}
          </div>
          <div className={cn("absolute z-40", tablet ? "inset-x-5 top-4" : "inset-x-3 top-2")}>
            {lessonTimer({ chip: "absolute right-0 top-full mt-2" })}
            <LiveTopBar host={host} follow={follow} onHost={openFollow} status={badge} viewers={videoEnded ? null : props.viewers} extra={settings} />
          </div>
        </div>
        <div className={cn("flex min-h-0 flex-1 flex-col justify-end pt-3", tablet ? "px-5 pb-5" : "px-3.5 pb-8")}>{lower}</div>
        {sheets}
      </div>
    );
  }

  if (phone) {
    return (
      <div className={cn("room-ambient text-white", light, landscape && "h-[393px] w-[852px]")} style={portrait ? { ...style, width: tall.w, height: tall.h } : style} data-status-dark>
        <RoomPartsStyle />
        <LiveStyle />
        <div className="relative size-full overflow-hidden bg-black [container-type:size]">
          {landscape ? (
            // Deitado, como na sala (e como no Twitch): o vídeo à esquerda, com a barra do Live dentro da
            // moldura dele, e o chat numa coluna à direita que não o tapa. Nada por baixo da ilha da câmara nem
            // colado às bordas: 59 px de cada lado, as zonas seguras do iPhone deitado (como no Webinar).
            <div className={cn("absolute inset-y-0 left-[59px] z-30 [container-type:size]", chatHidden ? "right-[59px]" : "right-[379px]")}>
              {video}
              <div className={cn(props.video.url ? videoBox : "absolute inset-0", "pointer-events-none z-30")}>
                <div className="pointer-events-auto absolute inset-x-2.5 top-2.5">
                  {lessonTimer({ chip: "absolute right-0 top-full mt-2", bar: "absolute inset-x-0 -top-1.5 rounded-full" })}
                  <LiveTopBar
                    host={host}
                    follow={follow}
                    onHost={openFollow}
                    status={badge}
                    viewers={videoEnded ? null : props.viewers}
                    extra={
                      <>
                        {chatToggle("size-9")}
                        {settings}
                      </>
                    }
                    slim={props.videoShape === "vertical"}
                  />
                </div>
                {/* Chat oculto: a prova social dentro da moldura do vídeo deitado (o vídeo ao alto é estreito: fica ao lado). */}
                {props.videoShape === "vertical" ? null : proof}
              </div>
              {props.videoShape === "vertical" ? proof : null}
              {frameToast}
              {ended}
            </div>
          ) : (
            <>
              {video}
              <div className={cn("absolute z-30", tablet ? "inset-x-5" : "inset-x-3")} style={{ top: tall.top + (tablet ? 16 : 10) }}>
                {lessonTimer({ chip: "absolute right-0 top-full mt-2", bar: "absolute inset-x-0 -top-1.5 rounded-full" })}
                <LiveTopBar
                  host={host}
                  follow={follow}
                  onHost={openFollow}
                  status={badge}
                  viewers={videoEnded ? null : props.viewers}
                  extra={settings}
                />
              </div>
              {frameToast}
              {ended}
            </>
          )}
          {/* Em baixo, logo acima da barra do iPhone: a caixa de escrever desce o mais possível sem lhe tocar. */}
          <div
            className={cn(
              "absolute z-20 flex flex-col",
              // Deitado, como na sala: 320 px mais a zona segura da direita; a caixa a 21 px da barra do iPhone.
              portrait ? column : "inset-y-0 right-0 w-[379px] justify-end pb-[21px] pl-1 pr-[59px] pt-3",
              chatHidden && "hidden",
            )}
            style={portrait ? { bottom: tablet ? 20 : 32 } : undefined}
          >
            {lower}
          </div>
          {sheets}
        </div>
      </div>
    );
  }

  // Computador (e tablet deitado): ecrã inteiro, o vídeo à esquerda e o painel de cima a baixo à direita, no tema da sala.
  const wideTablet = props.device === "tablet-landscape";
  return (
    <div
      className={cn("room-ambient relative flex overflow-hidden bg-black text-room-text", light)}
      style={{ ...style, ...(wideTablet ? { width: TABLET_WIDE.w, height: TABLET_WIDE.h, paddingTop: TABLET_WIDE.top } : { width: 1280, height: 720 }) }}
      data-status-dark
    >
      <RoomPartsStyle />
      <LiveStyle />
      {wideTablet ? <div aria-hidden className="absolute inset-x-0 top-0 bg-black" style={{ height: TABLET_WIDE.top }} /> : null}
      <section className="relative min-w-0 flex-1 overflow-hidden bg-black text-white [container-type:size]">
        {video}
        {/* Como na sala: o selo e o ⚙ dentro do vídeo, no canto de cima (numa moldura igual à do vídeo). */}
        {props.video.url ? <div className={cn(frame.box, "pointer-events-none z-30 shadow-none")}>{corners}</div> : corners}
        {/* Chat oculto: as mensagens, os corações e a oferta por cima do vídeo, dentro da moldura dele. */}
        {proof ? <div className={cn(props.video.url ? frame.box : "absolute inset-0", "pointer-events-none z-20 shadow-none")}>{proof}</div> : null}
        {frameToast}
        {ended}
      </section>
      <aside className={cn("relative flex h-full shrink-0 flex-col border-l border-room-line/60 bg-room-bg", wideTablet ? "w-[440px]" : "w-[400px]", chatHidden && "hidden")}>
        <div className={hl("title")}>
          <LivePanelHead title={props.title} host={host} follow={follow} onHost={openFollow} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">{lower}</div>
        {sheets}
      </aside>
    </div>
  );
}

function Panel({
  phone,
  tab,
  shown,
  open,
  hl,
  afterVideo,
  sheet,
  notice,
  onClose,
  tight,
  ...props
}: RoomPreviewProps & {
  phone: boolean;
  /** Telemóvel deitado: a coluna compacta da sala (separadores, mensagem fixada e caixa mais baixos). */
  tight?: boolean | undefined;
  tab: RoomTab;
  shown: OfferSlot | null;
  open: OfferSlot | null;
  hl: (k: string) => string;
  afterVideo: boolean;
  /** Dentro da folha do Live (telemóvel): sem o separador Chat. */
  sheet?: boolean | undefined;
  /** O aviso «já respondemos» no chat (exemplo do editor, com o Agente ligado). */
  notice?: boolean | undefined;
  /** Deitado, o chat por cima do vídeo fecha-se no X. */
  onClose?: (() => void) | undefined;
}) {
  const [text, setText] = useState("");
  const tabs: [RoomTab, string, typeof MessagesSquare][] = [
    // No Live do telemóvel o chat já está por cima do vídeo: a folha só tem o Suporte e a Oferta.
    ...(sheet ? [] : ([["chat", "Chat", MessagesSquare]] as [RoomTab, string, typeof MessagesSquare][])),
    ["support", "Suporte", Headset],
    ...(shown ? ([["offer", "Oferta", ShoppingCart]] as [RoomTab, string, typeof MessagesSquare][]) : []),
  ];
  // As que não cabem ficam cortadas em cima, por baixo do desvanecer (com o título minimizado, cabem mais).
  // Como na sala, o painel enche-se de mensagens (no tablet e no computador cabem mais).
  const chatItems = chatItemsAt(props, phone ? 10 : 14);
  const now = offerNow(props, shown);
  // No telemóvel ao alto, a oferta sobe por cima do chat como na sala; reduzida, fica uma barra.
  const [offerMin, setOfferMin] = useState(false);
  useEffect(() => setOfferMin(false), [shown?.id]);
  const card = props.device === "phone" && !sheet && tab === "chat" ? cardOffer(props, shown) : null;
  // A mensagem fixada sai no X, como na sala; volta quando o texto muda no editor.
  const [pinClosed, setPinClosed] = useState(false);
  useEffect(() => setPinClosed(false), [props.pin]);

  return (
    <div
      className={cn(
        // O chat na cor da sala (como na sala real); só uma linha muito suave à volta.
        "flex min-h-0 flex-col overflow-hidden bg-room-bg",
        // Deitado, a caixa e o coração descem até junto da barra do aparelho (como na sala).
        phone ? cn("flex-1", props.device === "phone" ? "pb-[22px]" : "pb-2") : "room-panel flex-1 rounded-2xl ring-1 ring-inset ring-room-line/60",
      )}
    >
      <RoomTabs
        big={!phone}
        tight={tight}
        active={tab}
        onTab={props.onTab}
        items={tabs.map(([value, label, Icon]) => ({ value, label, Icon, extra: value === "offer" && tab !== "offer" ? <PulseDot /> : null }))}
        trailing={
          onClose ? (
            <button type="button" onClick={onClose} aria-label="Fechar o chat" className="grid w-9 shrink-0 place-items-center text-room-subtle hover:text-room-text">
              <X className="size-5" />
            </button>
          ) : null
        }
      />

      {tab === "offer" && shown ? (
        <div className={cn("min-h-0 flex-1 overflow-y-auto", hl("pitch"))}>
          <OfferCard
            productName={shown.product}
            imageUrl={shown.id === "main" ? props.offerImageUrl : undefined}
            priceFrom={shown.priceFrom}
            priceNow={shown.priceNow}
            buttonText={shown.button || "Quero entrar"}
            onBuy={props.onBuy}
            countdownSeconds={now.seconds}
            showCountdown={now.left !== null}
            closed={now.closed}
            group={isGroupLink(shown.url)}
            look={(props.liveSettings ?? LIVE_DEFAULTS).offerLook}
            colors={props.liveSettings?.offerColors}
            banner={
              afterVideo ? (
                <>
                  <b className="block font-semibold">A aula terminou, mas as inscrições continuam abertas.</b>
                  Mais {Math.round(((open?.end ?? props.duration) - props.duration) / 60)} minutos.
                </>
              ) : null
            }
            note={!open ? `Na sala, esta oferta abre aos ${clock(shown.start)}.` : null}
            compact={phone}
            highlight={props.highlight}
          />
        </div>
      ) : (
        <>
          {tab === "chat" && props.pin && !pinClosed ? <ChatPin title={props.pin} onClose={() => setPinClosed(true)} className={hl("pin")} tight={tight} /> : null}
          {/* As mensagens mais antigas desvanecem em cima, em vez de ficarem cortadas a meio. */}
          <div
            className={cn(
              "flex min-h-0 flex-1 flex-col justify-end overflow-hidden [mask-image:linear-gradient(transparent,#000_28px)]",
              tight ? "gap-2 px-3 py-2" : "gap-3.5 p-4",
              props.device === "phone" && "pt-5",
            )}
          >
            {tab === "chat" ? (
              chatItems.length === 0 && !notice ? (
                <p className="m-auto text-center text-sm text-room-subtle">As mensagens aparecem ao longo do vídeo.</p>
              ) : (
                [
                  ...chatItems.map((item) =>
                  // Como na sala: a letra grande do chat em todos os aparelhos (também no telemóvel).
                  item.kind === "sale" ? (
                    <SaleLine key={item.key} text={`${item.s.buyer} comprou ${item.s.product}`} color={props.saleColor} />
                  ) : item.kind === "mine" ? (
                    <ChatLine key={item.key} author="Ana Costa" text={item.m.text} tone="mine" reaction={item.reaction} big tight={tight} />
                  ) : (
                    <div key={item.key} className={cn(props.highlight === `comment:${item.c.id}` && "-mx-2 rounded-lg bg-primary/15 px-2 py-1")}>
                      <ChatLine author={item.c.author} text={item.c.message} tone={item.c.agent ? "agent" : "people"} big tight={tight} />
                    </div>
                  ),
                  ),
                  notice ? <SupportNotice key="notice" onOpen={() => props.onTab("support")} /> : null,
                ]
              )
            ) : (
              <div className={cn("flex min-h-0 flex-1 flex-col", props.agent.on && hl("support"))}>
                <SupportMessages
                  thread={supportExample(props, shown ?? props.offers[0] ?? null)}
                  teamName={props.host.name ? `Equipa de ${props.host.name}` : "Equipa"}
                  empty="Escreva à equipa. A resposta aparece aqui, só para si."
                />
              </div>
            )}
          </div>
          {card ? (
            <div className={cn("shrink-0 px-3 pb-2.5", hl("pitch"))}>
              {offerMin ? (
                // A seta só volta a abrir o cartão aqui; a oferta inteira abre no separador que pisca ou no botão de comprar.
                <LiveOfferSlim offer={card} onOpen={() => setOfferMin(false)} />
              ) : (
                <LiveOfferCard offer={card} onBuy={() => props.onBuy?.()} onMinimize={() => setOfferMin(true)} onExpand={() => props.onTab("offer")} panel />
              )}
            </div>
          ) : null}
          <ChatComposer
            compact={phone}
            tight={tight}
            value={text}
            onChange={setText}
            onSubmit={() => {
              props.onSend(text.trim(), tab === "support" ? "support" : "chat");
              setText("");
            }}
            placeholder={tab === "support" ? "Escreva à equipa…" : "Escreva no chat…"}
            withReactions={tab === "chat"}
            onHeart={props.onHeart}
            reactions={props.reactions}
          />
        </>
      )}
    </div>
  );
}

/**
 * Os vídeos da pré-visualização abertos (o último é o que está à frente, ex.: o ecrã completo). O
 * iPhone só deixa tocar com som dentro do próprio toque, por isso o play do editor chama
 * `playPreviewWithSound` no clique, antes de o estado mudar.
 */
const previewMedia: HTMLVideoElement[] = [];
export function playPreviewWithSound(volume: number) {
  const video = previewMedia.at(-1);
  if (!video) return;
  video.muted = volume === 0;
  video.volume = volume;
  void video.play().catch(() => {});
}

/**
 * O leitor da sala a seguir o relógio do editor (o relógio manda, o vídeo acompanha). Serve
 * ficheiros, HLS e as plataformas (Vimeo, Panda, Bunny) com o mesmo leitor da sala pública.
 */
function PreviewPlayer({
  url,
  provider,
  t,
  playing,
  volume,
  fit = "cover",
  ambient = false,
}: {
  url: string;
  provider: string | null;
  t: number;
  playing: boolean;
  volume: number;
  fit?: "cover" | "contain" | undefined;
  /** Em pausa com o botão de entrar à frente: o vídeo corre sem som por trás, «fusco», como na sala. */
  ambient?: boolean | undefined;
}) {
  const media = useRef<HTMLVideoElement>(null);
  const running = playing || ambient;
  const embed = /youtube|youtu\.be|vimeo|mediadelivery|pandavideo|\/embed\/|player\./i.test(url);
  useEffect(() => {
    const video = media.current;
    if (!video) return;
    previewMedia.push(video);
    return () => {
      const i = previewMedia.indexOf(video);
      if (i >= 0) previewMedia.splice(i, 1);
    };
  }, [url]);
  // Leitores embebidos não deixam pausar por fora: em pausa mostra-se a imagem parada por cima.
  const [session, setSession] = useState(0);
  const startAt = useRef(Math.floor(t));
  useEffect(() => {
    if (!embed || !playing) return;
    startAt.current = Math.floor(t);
    setSession((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, embed]);
  useEffect(() => {
    const video = media.current;
    if (!video) return;
    if (running) void video.play().catch(() => {});
    else video.pause();
  }, [running]);
  useEffect(() => {
    const video = media.current;
    if (!video || video.readyState < 1) return;
    if (Math.abs(video.currentTime - t) > (playing ? 1.5 : 0.3)) video.currentTime = t;
  }, [t, playing]);
  useEffect(() => {
    const video = media.current;
    if (!video) return;
    video.volume = volume;
    video.muted = !playing || volume === 0;
  }, [volume, playing]);
  if (embed && !running) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-[#111] text-xs text-white/60">
        <span className="rounded-full bg-black/60 px-3 py-1">{clock(t)}</span>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 [&_video]:size-full [&_video]:object-cover">
      <VideoPlayer
        key={embed ? session : url}
        url={url}
        provider={provider}
        fit={fit}
        controls={false}
        mediaRef={media}
        autoPlay={running}
        muted={!playing || volume === 0}
        quiet
        startAtSeconds={embed ? startAt.current : Math.floor(t)}
        // O relógio do editor é que manda; o tempo do leitor não volta para trás.
        onTime={() => {}}
        className="size-full rounded-none"
      />
    </div>
  );
}
