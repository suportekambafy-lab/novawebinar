import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  Headset,
  MessagesSquare,
  Pin,
  RotateCcwSquare,
  ShoppingCart,
  Volume2,
  X,
} from "lucide-react";
import { useHearts, useLivePresence } from "@/lib/live-presence";
import { useVideoShape, VideoPlayer } from "@/components/video-player";
import { LessonTimer } from "@/components/room/lesson-timer";
import {
  activeOffer,
  checkoutLink,
  entryPalette,
  FOLLOW_NETWORKS,
  followAppLink,
  followMomentAt,
  followWebLink,
  isGroupLink,
  LIVE_DEFAULTS,
  offerColor,
  offerDeadlinePassed,
  offerTimer,
  profileHandle,
  purchaseOnScreen,
  type FollowNetwork,
  type LiveSettings,
  type OfferSlot,
  type RoomFormat,
} from "@/lib/room-logic";
import { useServerFn } from "@tanstack/react-start";
import { getPublicRoomPurchases } from "@/lib/public-room.functions";
import {
  CaptionLine,
  ChatComposer,
  ChatPin,
  ChatToggle,
  ChatLine,
  ENTRY_DIM,
  EntryPlay,
  FullscreenButton,
  LIVE_COLUMN_BG,
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
} from "@/components/room/room-parts";
import { useAudienceCount } from "@/components/audience-counter";
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
} from "@/components/room/live-parts";
import { GroupJoinDialog } from "@/components/room/group-join";
import { cn, isHttpUrl } from "@/lib/utils";
import { PreliveCountdown, unlockPreliveAudio, type CountdownBackdrop } from "@/components/prelive-countdown";
import { watchedStep } from "@/lib/participant-facts";
import { chatEcho, placeOf, type ChatPerson } from "@/lib/chat-reactions";
import { useSimulatedHearts } from "@/lib/room-hearts";
import type { RoomTeamMessage, TeamRole } from "@/lib/room-team";
import { useDataSaver } from "@/lib/room-data-saver";
import { TestScrubber } from "@/components/room/test-scrubber";
import whatsappIcon from "@/assets/local/whatsapp-icon.webp";

/** O que a sala envia com cada sinal de progresso. */
export type RoomProgressOptions = {
  final?: boolean;
  /** Posição em que a pessoa começou a ver; null até começar. */
  entry?: number | null;
  /** Segundos vistos desde o sinal anterior. */
  played?: number;
  /** Corações que a pessoa tocou desde o sinal anterior (o Painel conta-os). */
  hearts?: number;
};

type Mode = "live" | "replay";
type Tab = "chat" | "support" | "offer";
type SentMessage = { id: string; text: string; at: Date; failed?: boolean };

/** O selo de quem é da equipa, no chat. */
const TEAM_BADGE: Record<TeamRole, string> = { equipa: "Equipa", apresentador: "Apresentador" };

// Live deitado (telemóvel, tablet pequeno): a coluna do chat à direita e o vídeo a acabar onde ela começa.
const LIVE_LAND_COL = "w-[calc(min(320px,40vw)+env(safe-area-inset-right))]";
const LIVE_LAND_RIGHT = "right-[calc(min(320px,40vw)+env(safe-area-inset-right))]";

export type RoomWebinar = {
  id: string;
  public_title: string;
  description: string;
  host_name?: string | null;
  host_role?: string | null;
  host_avatar_url?: string | null;
  chat_pin_title?: string | null;
  chat_pin_message?: string | null;
  offer_pin_title?: string | null;
  offer_pin_message?: string | null;
  cta_text: string | null;
  cta_url: string | null;
  cta_color: string | null;
  cta_price_original?: string | null;
  cta_price_now?: string | null;
  cta_image_url?: string | null;
  cta_countdown_seconds?: number | null;
  cta_start_seconds: number | null;
  cta_end_seconds: number | null;
  video_url: string | null;
  video_provider: string | null;
  duration_seconds: number;
  /** O convite do grupo de WhatsApp do fluxo: o botão na espera (o «Obrigado» depois da inscrição). */
  group_url?: string | null;
};

export type RoomSocialProof = {
  enabled: boolean;
  product_name: string;
  start_mode: string;
  start_delay_seconds: number;
  start_seconds: number | null;
  end_seconds: number | null;
  min_interval_seconds?: number | null;

  position: string;
  display_seconds: number;
  animation: string;
  sound_enabled: boolean;
  notification_color?: string | null;
};

export type RoomPurchase = {
  id: string;
  buyer_name: string;
  product_name: string;
  message: string;
  offset_seconds: number;
};

export type RoomComment = {
  id: string;
  author_name: string;
  avatar_url?: string | null;
  message: string;
  offset_seconds: number;
  created_at?: string | null;
};

/** Se o ecrã responde à media query; acompanha as mudanças (rodar o aparelho, redimensionar). */
function useMedia(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}

export function WebinarRoom({
  webinar,
  comments,
  audienceMode,
  curve,
  mode,
  theme = "dark",
  startsAt,
  socialProof,
  purchases = [],
  syncWithStart = false,
  resumeSeconds,
  resumePeakSeconds,
  preliveSeconds = 0,
  preliveSound = true,
  preliveMessage = "",
  preliveTemplate = null,
  preliveAppearance,
  preliveColor,
  preliveBackground,
  viewerName,
  organizationId,
  onSend,
  supportMessages = [],
  onCtaView,
  onCtaClick,
  onProgress,
  checkoutOrigin,
  appearance = "dark",
  onAppearance,
  captions = [],
  offers,
  sales,
  audienceFormat,
  hostVerified = true,
  onJoinGroup,
  prefill,
  format = "webinar",
  live = LIVE_DEFAULTS,
  team = null,
  teamMessages = [],
  testControls = false,
}: {
  /** Sala de teste: a barra do vídeo (play/pausa, avançar e recuar), como no YouTube. Nunca na sala pública. */
  testControls?: boolean | undefined;
  webinar: RoomWebinar;
  /** «live»: vídeo em ecrã inteiro no telemóvel, com o chat por cima; no computador, o vídeo e o chat ao lado. */
  format?: RoomFormat | undefined;
  /** Quem entrou como equipa: os comentários chegam a todos com o selo e não há Suporte. */
  team?: { name: string; role: TeamRole } | null | undefined;
  /** Os comentários da equipa já confirmados pelo servidor. */
  teamMessages?: readonly RoomTeamMessage[] | undefined;
  /** Definições do formato Live (orientação no computador, selo, redes, momentos do + Seguir, cor da oferta). */
  live?: LiveSettings | undefined;
  /** A aparência escolhida (do organizador ou desta pessoa); `theme` é o resultado. */
  appearance?: Appearance;
  onAppearance?: ((appearance: Appearance) => void) | undefined;
  /** A fala do vídeo, para as legendas. */
  captions?: readonly { at: number; text: string }[];
  /**
   * As ofertas seguintes à principal, o prazo da principal (`closed`), o fecho no zero e a origem no
   * link. Cada oferta seguinte fecha no seu último dia, no fuso do webinar (`timezone`).
   */
  offers?: { extra: readonly OfferSlot[]; closed: boolean; closeAtZero: boolean; utm: boolean; timezone?: string | undefined } | undefined;
  /** Onde aparecem as compras e se as reais da Kambafy entram na sala. */
  sales?: { where: "chat" | "video" | "both"; real: boolean } | undefined;
  /** «off»: a sala não mostra quantas pessoas estão a ver. */
  audienceFormat?: string | null | undefined;
  hostVerified?: boolean | undefined;
  /** Entrar no grupo da oferta: grava os dados confirmados (nome, e-mail, WhatsApp). */
  onJoinGroup?: ((data: { name: string; email: string; phone: string }) => void) | undefined;
  /** O que a pessoa escreveu na entrada, para não ter de repetir no pop-up do grupo. */
  prefill?: { name?: string; email?: string; phone?: string } | undefined;
  /** O anúncio de onde a pessoa veio, para o link do checkout. */
  checkoutOrigin?: { source?: string | null; medium?: string | null; campaign?: string | null } | undefined;
  comments: RoomComment[];
  audienceMode: string;
  curve: unknown;
  mode: Mode;
  /** Tema visual da sala: escuro (predefinido) ou claro. */
  theme?: "dark" | "light";
  /** Data e hora marcadas. Com ela a sessão arranca sozinha e termina ao fim da duração. */
  startsAt?: string | null;
  /** Regras das notificações de compra. */
  socialProof?: RoomSocialProof | null;
  /** Notificações de compra de demonstração, marcadas como simulação. */
  purchases?: RoomPurchase[];
  /** Faz o vídeo arrancar no minuto correspondente à hora marcada. */
  syncWithStart?: boolean;
  /** Posição guardada desta pessoa no vídeo: usada quando a sincronização está desligada. */
  resumeSeconds?: number | null;
  /** Ponto mais avançado já visto por esta pessoa: evita repetir eventos ao recuar. */
  resumePeakSeconds?: number | null;
  /** Contagem animada antes do arranque, em segundos. Zero desliga. */
  preliveSeconds?: number;
  /** Som de fundo durante a contagem de arranque. */
  preliveSound?: boolean;
  /** Frase mostrada durante a contagem de arranque. */
  preliveMessage?: string;
  /** Modelo visual da contagem de arranque. */
  preliveTemplate?: string | null;
  /** Ajustes de aparência do modelo escolhido. */
  preliveAppearance?: unknown;
  /** A cor da contagem (anel, blocos, barra). */
  preliveColor?: string | null | undefined;
  /** A imagem ou o vídeo de fundo da contagem; sem nenhum, a cor. */
  preliveBackground?: CountdownBackdrop | null | undefined;
  viewerName: string;
  /** Workspace da sessão. Com ele a sala aparece na vista ao vivo. */
  organizationId?: string | null;
  /** `id`: o da mensagem, que dá as reacções simuladas (e, na equipa, o mesmo em todas as salas). */
  onSend: (body: string, id: string) => Promise<void>;
  /** Conversa privada com a equipa: o que o participante escreveu e as respostas do suporte. */
  supportMessages?: { id: string; body: string; sender_kind: string; created_at: string }[];
  onCtaView?: (() => void) | undefined;
  onCtaClick?: (() => void) | undefined;
  onProgress?: ((seconds: number, peakSeconds?: number, options?: RoomProgressOptions) => void) | undefined;
}) {
  const [seconds, setSeconds] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [videoDriven, setVideoDriven] = useState(false);
  const [videoEnded, setVideoEnded] = useState(false);
  const lastVideoRef = useRef(0);
  // Relógio de conteúdo: a posição real do vídeo desta pessoa. Chat, oferta,
  // notificações simuladas e o assistente seguem este relógio, não o da sessão.
  const [videoSeconds, setVideoSeconds] = useState(0);
  const contentPeakRef = useRef(0);

  const [text, setText] = useState("");
  const [sent, setSent] = useState<SentMessage[]>([]);
  const [ctaLogged, setCtaLogged] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [pinDismissed, setPinDismissed] = useState(false);
  const [commentArrival, setCommentArrival] = useState<Record<string, Date>>({});
  const roomRef = useRef<HTMLElement>(null);
  // Teclado aberto no telemóvel (a caixa de escrever com o foco).
  const [typing, setTyping] = useState(false);
  // Sem caixa (separador Oferta, replay) não se escreve: se ela saiu com o foco (o Firefox não avisa), não fica preso.
  const typingNow = typing && tab !== "offer" && mode !== "replay";
  const feedRef = useRef<HTMLDivElement>(null);
  const keyboardFrameRef = useRef<number | null>(null);
  const { hearts, sendHeart: shareHeart } = useHearts(webinar.id);
  // Os corações desta pessoa juntam-se e seguem com o progresso (de 30 em 30 s), nunca um pedido por toque.
  const tappedRef = useRef(0);
  const sendHeart = useCallback(() => {
    tappedRef.current += 1;
    shareHeart();
  }, [shareHeart]);
  const [checkout, setCheckout] = useState(false);
  // O navegador só deixa arrancar sem som. Pedimos um toque para ligar o áudio.
  const [soundOn, setSoundOn] = useState(false);
  // «Poupar dados» (automático: rede lenta ou poupança do telemóvel): no máximo 360p e o vídeo só
  // descarrega depois do toque (por trás do botão de entrar fica a capa, em vez do vídeo a correr).
  const saveData = useDataSaver();
  const [volume, setVolume] = useState(1);
  const playbackRate = 1;
  const [captionsOn, setCaptionsOn] = useState(false);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const joinOffsetRef = useRef<number | null>(null);
  const [preliveEnding, setPreliveEnding] = useState(false);
  const [preliveReady, setPreliveReady] = useState(false);
  const [preliveBlack, setPreliveBlack] = useState(false);
  const [preliveReveal, setPreliveReveal] = useState(false);
  const revealTimerRef = useRef<number | null>(null);
  const finishTimerRef = useRef<number | null>(null);
  const playbackFallbackRef = useRef<number | null>(null);

  const wasPreliveRef = useRef(false);

  // Formato Live: no telemóvel o vídeo enche o ecrã e o chat fica por cima; o Suporte e a oferta
  // inteira abrem numa folha por baixo. No computador o vídeo fica ao centro e o chat ao lado.
  const liveLayout = format === "live";
  // O vídeo diz se é deitado ou ao alto, e cada aparelho tem regras fixas para cada forma (ver
  // `liveFrame`). A forma lê-se antes de o leitor abrir (ficheiro ou oEmbed do Vimeo); o leitor
  // confirma-a (HLS). Quando a plataforma não diz (Bunny, Panda), vale a forma gravada (dados antigos).
  const [playerShape, setPlayerShape] = useState<LiveSettings["desk"] | null>(null);
  const desktop = useMedia("(min-width: 1024px)");
  // Aparelho de toque (telemóvel, tablet): só nestes há aviso de rodar e chat maior no tablet.
  const coarse = useMedia("(pointer: coarse)");
  // «Computador» é só rato e teclado. O tablet fica sempre na árvore de telemóvel/tablet, que já tem o desenho
  // deitado: ao rodar, deixa de passar a barreira dos 1024 px e trocar de árvore, o que criava um vídeo novo e, no
  // Safari, o deixava em silêncio (arrancado sem toque, só os botões de volume lhe devolviam o som).
  const wide = desktop && !coarse;
  // Webinar no telemóvel ao alto: a oferta sobe por cima do chat (como no Live) em vez de trocar de separador.
  const phoneTall = useMedia("(max-width: 767px) and (orientation: portrait)");
  // O botão de entrar pequeno só no telemóvel (ao alto ou deitado); o tablet usa o do computador, como na pré-visualização.
  const phoneSize = useMedia("(max-width: 767px), (max-height: 500px)");
  // Live com o vídeo deitado num ecrã ao alto (telemóvel, tablet): a sala empilha-se como no YouTube.
  // Em cima, logo abaixo da zona da câmara, o vídeo a toda a largura com a barra do Live por dentro; por
  // baixo, o chat e a caixa de escrever, no tema da sala. O vídeo ao alto continua a encher o ecrã.
  const portrait = useMedia("(orientation: portrait)");
  // Telemóvel deitado (o `phone-land` do CSS): a coluna do chat compacta, para caberem mais mensagens.
  const phoneLand = useMedia("(orientation: landscape) and (max-width: 1023px) and (max-height: 540px)");
  // No Webinar a forma só decide o telemóvel deitado com o vídeo ao alto (`turnUp`); sem ela, deitado. Por isso a
  // sonda (um <video> só de metadados) só corre quando essa forma pode contar, e nunca com poupar dados; depois do
  // toque em «Assistir agora» vale a forma lida do próprio leitor (`playerShape`).
  // Ao alto também corre quando o botão de ecrã inteiro pode aparecer (só com vídeo horizontal lido).
  const probedShape = useVideoShape(
    liveLayout || (coarse && !wide && !saveData && (!portrait || live.fullscreenButton !== false)) ? webinar.video_url : null,
    webinar.video_provider,
  );
  const videoShape = playerShape ?? probedShape ?? (liveLayout ? live.desk : "horizontal");
  const liveStack = liveLayout && !wide && portrait && videoShape !== "vertical";
  // Tablet (ao alto, ou deitado com toque): o chat do Live com letra e caixa maiores, para ler à distância.
  const bigChat = !phoneSize && (!wide || coarse);
  // A moldura do Live: só a forma do vídeo e o aparelho (a posição antiga gravada já não conta).
  const liveBox = liveFrame(videoShape, wide ? "desk" : "phone");
  // A moldura do vídeo no palco do Live (fora do empilhado), com as regras do telemóvel e do tablet deitados.
  // Sem prender à largura: `!wide` já diz que é toque, e um tablet deitado passa os 1024 px.
  const liveBoxClass = cn(
    liveStack ? "absolute inset-0" : liveBox.box,
    !wide &&
      !liveStack &&
      (liveBox.place === "fill"
        ? "landscape:h-full landscape:w-[56.25cqh]"
        : "landscape:left-1/2 landscape:top-1/2 landscape:w-[min(100cqw,177.78cqh)] landscape:-translate-x-1/2 landscape:-translate-y-1/2"),
  );
  // No Live o Suporte, a oferta inteira e as redes abrem numa folha por cima da sala.
  const [sheet, setSheet] = useState<null | "support" | "offer" | "follow">(null);
  const [offerMin, setOfferMin] = useState(false);
  // Webinar no telemóvel deitado com o chat oculto: a oferta chega como barra (o cartão inteiro tapava as mensagens
  // num ecrã baixo); a seta abre o cartão daquela oferta.
  const [landCardFor, setLandCardFor] = useState<string | null>(null);
  const [tapped, setTapped] = useState<Partial<Record<FollowNetwork, boolean>>>({});
  // Quem já seguiu (tocou numa rede e fechou) deixa de ver o + Seguir neste webinar.
  const followKey = `cw:seguiu:${webinar.id}`;
  const [followed, setFollowed] = useState(false);
  useEffect(() => {
    try {
      setFollowed(window.localStorage.getItem(followKey) === "1");
    } catch {
      // Sem armazenamento (navegação privada): o + Seguir volta a aparecer nos momentos.
    }
  }, [followKey]);
  // As respostas do Suporte que chegam depois de a pessoa entrar contam como por ler até abrir o Suporte.
  const enteredAtRef = useRef(Date.now());
  const [supportSeenAt, setSupportSeenAt] = useState(0);
  const [notices, setNotices] = useState<Date[]>([]);
  const liveFeedRef = useRef<HTMLDivElement>(null);

  // A transição suave de fim de contagem é ativada depois de `prelive` ser calculada.

  useLivePresence({
    organizationId: organizationId ?? null,
    webinarId: webinar.id,
    webinarTitle: webinar.public_title,
    name: viewerName,
    mode,
    checkout,
  });

  const startMs = useMemo(() => {
    if (!startsAt) return null;
    const value = new Date(startsAt).getTime();
    return Number.isNaN(value) ? null : value;
  }, [startsAt]);

  useEffect(() => {
    // O relógio real também alimenta o contador da oferta. Tem de continuar
    // ativo mesmo nas sessões sem uma data marcada e depois do fim do vídeo.
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // No telemóvel, acompanhamos a abertura do teclado quadro a quadro. O bloqueio
  // do scroll evita o salto inicial do Safari para a composição antiga da sala.
  // A altura do teclado, lida na primeira vez que abre: nas seguintes a sala encolhe logo ao tocar na caixa,
  // ao mesmo tempo que o teclado sobe, em vez de dar um salto quando ele acaba de subir.
  const keyboardHeightRef = useRef(0);
  useEffect(() => {
    try {
      keyboardHeightRef.current = Number(localStorage.getItem("nw-keyboard")) || 0;
    } catch {
      // Sem armazenamento: aprende-se outra vez nesta visita.
    }
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const room = roomRef.current;
    if (!viewport || !room) return;

    const paintVisibleRoom = () => {
      const gap = window.innerHeight - viewport.height;
      if (room.classList.contains("live-room-shell--keyboard") && gap > 120 && gap !== keyboardHeightRef.current) {
        keyboardHeightRef.current = gap;
        try {
          localStorage.setItem("nw-keyboard", String(gap));
        } catch {
          // Sem armazenamento: fica só nesta visita.
        }
      }
      // A árvore presa (telemóvel e tablet) segue sempre a área visível; só o computador fica solto.
      if (!room.classList.contains("live-room-shell--fixed") && window.matchMedia("(min-width: 1024px)").matches) {
        room.style.removeProperty("--room-visible-height");
        room.style.removeProperty("--room-visible-top");
        return;
      }
      room.style.setProperty("--room-visible-height", `${Math.round(viewport.height)}px`);
      room.style.setProperty("--room-visible-top", `${Math.round(viewport.offsetTop)}px`);
    };

    const updateVisibleRoom = () => {
      if (keyboardFrameRef.current !== null) {
        window.cancelAnimationFrame(keyboardFrameRef.current);
      }
      keyboardFrameRef.current = window.requestAnimationFrame(() => {
        paintVisibleRoom();
        keyboardFrameRef.current = null;
      });
    };

    paintVisibleRoom();
    viewport.addEventListener("resize", updateVisibleRoom);
    viewport.addEventListener("scroll", updateVisibleRoom);
    window.addEventListener("orientationchange", updateVisibleRoom);
    return () => {
      if (keyboardFrameRef.current !== null) {
        window.cancelAnimationFrame(keyboardFrameRef.current);
      }
      viewport.removeEventListener("resize", updateVisibleRoom);
      viewport.removeEventListener("scroll", updateVisibleRoom);
      window.removeEventListener("orientationchange", updateVisibleRoom);
    };
  }, []);

  // A barra de estado (o relógio) fica sempre preta, em qualquer tema, como o vídeo logo por baixo (igual à
  // pré-visualização); o tema muda o resto da sala.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#000000";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const scheduled = mode === "live" && startMs !== null;
  const elapsed = startMs === null ? 0 : (now - startMs) / 1000;
  const waiting = scheduled && elapsed < 0;
  const untilStart = Math.max(0, Math.round(-elapsed));
  const embedLike = /youtube|youtu\.be|vimeo|mediadelivery|pandavideo|\/embed\/|player\./i.test(
    webinar.video_url ?? "",
  );
  // Contagem de arranque: o chat já está aberto e o lugar do vídeo mostra o
  // relógio animado até a transmissão entrar no ar.
  const prelive = waiting && preliveSeconds > 0 && untilStart <= preliveSeconds;

  // Ligar o som: serve o aviso no rodapé e qualquer toque no ecrã.
  const enableSound = useCallback(() => {
    unlockPreliveAudio();
    const video = liveVideoRef.current;
    if (video) {
      video.volume = volume > 0 ? volume : 1;
      if (!prelive) {
        // Já em transmissão: o vídeo nunca pára, o toque só liga o som.
        video.muted = false;
        void video.play().catch(() => undefined);
      }
    }
    setSoundOn(true);
  }, [prelive, volume]);

  // Enquanto o som estiver desligado, qualquer toque no ecrã liga-o.
  useEffect(() => {
    if (soundOn) return;
    const handler = () => enableSound();
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, [soundOn, enableSound]);

  // Sincroniza volume e velocidade com o leitor real (canvas/video).
  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = !soundOn || volume === 0;
  }, [volume, soundOn]);

  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
  }, [playbackRate]);
  useEffect(() => {
    if (!wasPreliveRef.current || prelive) {
      wasPreliveRef.current = prelive;
      return;
    }
    // A contagem e a transmissão comportam-se como uma sequência contínua:
    // escurece, o vídeo arranca escondido e só depois é revelado já em movimento.
    setPreliveEnding(true);
    setPreliveReady(false);
    setPreliveBlack(false);
    setPreliveReveal(false);
    const cover = window.setTimeout(() => setPreliveBlack(true), 20);
    const arm = window.setTimeout(() => setPreliveReady(true), 700);
    // Leitores externos não comunicam o evento de reprodução à página. Nesses
    // casos mantemos os dois segundos de transição e revelamos após o autoplay.
    if (embedLike) {
      playbackFallbackRef.current = window.setTimeout(() => {
        setPreliveReveal(true);
        setPreliveBlack(false);
        playbackFallbackRef.current = null;
        finishTimerRef.current = window.setTimeout(() => {
          setPreliveEnding(false);
          finishTimerRef.current = null;
        }, 1000);
      }, 1400);
    }
    wasPreliveRef.current = false;
    return () => {
      window.clearTimeout(cover);
      window.clearTimeout(arm);
    };
  }, [embedLike, prelive]);

  useEffect(
    () => () => {
      if (revealTimerRef.current !== null) window.clearTimeout(revealTimerRef.current);
      if (finishTimerRef.current !== null) window.clearTimeout(finishTimerRef.current);
      if (playbackFallbackRef.current !== null) window.clearTimeout(playbackFallbackRef.current);
    },
    [],
  );

  // A transmissão termina à hora prevista ou logo que o vídeo chegue ao fim.
  const finished =
    (scheduled && webinar.duration_seconds > 0 && elapsed > webinar.duration_seconds) || videoEnded;
  // Quando a hora está definida, o relógio da sessão segue a data marcada.
  const timeline = scheduled
    ? Math.max(
        0,
        webinar.duration_seconds > 0 ? Math.min(elapsed, webinar.duration_seconds) : elapsed,
      )
    : seconds;

  // Relógio de conteúdo: sem vídeo não há posição própria, por isso a sessão
  // serve de fallback. Com vídeo, é o ponto exato que esta pessoa está a ver.
  const contentSeconds = webinar.video_url ? videoSeconds : timeline;
  if (contentSeconds > contentPeakRef.current) contentPeakRef.current = contentSeconds;
  const contentPeak = contentPeakRef.current;
  // Quem volta à sala retoma também o ponto mais avançado que já tinha visto.
  useEffect(() => {
    const seed = Math.max(0, Math.floor(resumePeakSeconds ?? 0));
    if (seed > contentPeakRef.current) contentPeakRef.current = seed;
  }, [resumePeakSeconds]);

  // Quem entra a meio apanha a sessão no ponto certo, quando isso está ligado.
  // Com a sincronização desligada, o vídeo continua onde esta pessoa deixou.
  if (joinOffsetRef.current === null && scheduled && !waiting) {
    joinOffsetRef.current = Math.max(0, Math.floor(elapsed));
  }
  const startAtSeconds = syncWithStart
    ? (joinOffsetRef.current ?? 0)
    : Math.max(0, Math.floor(resumeSeconds ?? 0));

  const viewers = useAudienceCount({
    webinarId: webinar.id,
    seconds: timeline,
    mode: audienceMode,
    curve,
    durationSeconds: webinar.duration_seconds,
  });

  // Relógio próprio da sessão. Só para quando o vídeo estiver mesmo a correr
  // e a dar o seu tempo; se o vídeo falhar, a sessão continua a avançar.
  useEffect(() => {
    if (scheduled) return;
    const timer = window.setInterval(() => {
      if (videoDriven && Date.now() - lastVideoRef.current < 2500) return;
      setSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [scheduled, videoDriven]);

  // O progresso guardado e o assistente seguem a posição real do vídeo.
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const contentSecondsRef = useRef(contentSeconds);
  contentSecondsRef.current = contentSeconds;

  // Tempo efectivamente visto: só conta o avanço natural do conteúdo, com a sala
  // visível ou, no vídeo próprio, com o som ligado. Sem vídeo, ou com vídeo
  // embutido (a sala não sabe a posição), conta o relógio da sessão com a sala visível.
  const ownVideo = Boolean(webinar.video_url) && !embedLike;
  const watchClockRef = useRef(0);
  watchClockRef.current = ownVideo ? videoSeconds : timeline;
  const listeningRef = useRef(false);
  listeningRef.current = ownVideo && soundOn && volume > 0;
  const playedRef = useRef(0);
  const entryRef = useRef<number | null>(null);
  useEffect(() => {
    if (!onProgress) return;
    let previous: number | null = null;
    const timer = window.setInterval(() => {
      const clock = watchClockRef.current;
      const present = document.visibilityState === "visible" || listeningRef.current;
      const step = watchedStep(previous, clock, present);
      if (step > 0) {
        entryRef.current ??= Math.max(0, Math.round(clock - step));
        playedRef.current += step;
      }
      previous = clock;
    }, 1000);
    return () => window.clearInterval(timer);
  }, [onProgress]);

  const flushProgress = useCallback((options?: { final?: boolean }) => {
    const played = Math.floor(playedRef.current);
    playedRef.current -= played;
    const tapped = tappedRef.current;
    tappedRef.current = 0;
    onProgressRef.current?.(
      Math.round(contentSecondsRef.current),
      Math.round(contentPeakRef.current),
      { ...options, entry: entryRef.current, played, hearts: tapped },
    );
  }, []);
  // Batimento fixo de 30 s (não reinicia com o tempo do vídeo), mais uma
  // gravação ao esconder ou fechar a página e ao sair da sala (o que fica por enviar segue no próximo).
  useEffect(() => {
    if (!onProgress) return;
    const timer = window.setInterval(() => flushProgress(), 30_000);
    const onHidden = () => {
      if (document.visibilityState === "hidden") flushProgress({ final: true });
    };
    const onPageHide = () => flushProgress({ final: true });
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", onPageHide);
      flushProgress({ final: true });
    };
  }, [onProgress, flushProgress]);

  // As ofertas no tempo do vídeo: a principal (colunas cta_*) e as seguintes. A que está aberta
  // segue o ponto mais avançado que a pessoa viu: quem recua não perde a oferta já entregue.
  const offerList = useMemo<OfferSlot[]>(() => {
    const mainStart = webinar.cta_start_seconds ?? 0;
    const main: OfferSlot[] = webinar.cta_text
      ? [
          {
            id: "main",
            start: mainStart,
            end: webinar.cta_end_seconds != null && webinar.cta_end_seconds > mainStart ? webinar.cta_end_seconds : null,
            product: socialProof?.product_name?.trim() ?? "",
            priceFrom: webinar.cta_price_original ?? "",
            priceNow: webinar.cta_price_now ?? "",
            url: webinar.cta_url ?? "",
            button: webinar.cta_text,
            countdown: webinar.cta_countdown_seconds ?? 0,
          },
        ]
      : [];
    return [...main, ...(offers?.extra ?? [])];
  }, [webinar, socialProof?.product_name, offers?.extra]);
  // Depois do vídeo, o tempo das ofertas continua pelo relógio real: uma oferta que fecha depois
  // do fim mantém a sala aberta para compras até lá.
  const endedAtRef = useRef<number | null>(null);
  if (finished && endedAtRef.current === null) endedAtRef.current = Date.now();
  const afterSeconds = finished && endedAtRef.current !== null ? Math.max(0, (now - endedAtRef.current) / 1000) : 0;
  const offerClock = finished ? Math.max(contentPeak, webinar.duration_seconds) + afterSeconds : contentPeak;
  const currentOffer = waiting ? null : activeOffer(offerList, offerClock);
  const ctaVisible = currentOffer !== null;
  // Corações simulados (iguais para todos no mesmo segundo do vídeo, mais com a oferta aberta), juntos aos
  // reais no botão do coração. Não contam para as «Reacções» do Painel: essas são só os toques (`tappedRef`).
  const simHearts = useSimulatedHearts(contentSeconds, webinar.id, ctaVisible, !waiting && !finished);
  const reactions = useMemo(() => [...hearts, ...simHearts], [hearts, simHearts]);
  /** A sala continua aberta depois da aula: quanto falta para fechar, em segundos. */
  const openAfter =
    finished && currentOffer?.end != null && currentOffer.end > webinar.duration_seconds
      ? Math.max(0, Math.round(currentOffer.end - offerClock))
      : null;
  const [groupOpen, setGroupOpen] = useState(false);

  useEffect(() => {
    if (!ctaVisible || ctaLogged) return;
    setCtaLogged(true);
    onCtaView?.();
  }, [ctaVisible, ctaLogged, onCtaView]);

  // O chat com o aparelho deitado e no computador (Webinar e Live): visível até a pessoa o ocultar no
  // botão; a escolha fica ao rodar o aparelho durante a visita. Ao alto, o chat vê-se sempre. Oculto,
  // a oferta aparece por cima do vídeo (`proof`), sem voltar a abrir o chat.
  const [chatOpen, setChatOpen] = useState(true);
  // Quando uma oferta abre, o separador dela salta para a frente.
  // No Webinar do telemóvel ao alto o chat fica e a oferta sobe por cima dele, como no Live.
  useEffect(() => {
    if (currentOffer && !(phoneTall && !liveLayout)) {
      // A caixa de escrever sai com o separador: fecha-se o teclado antes, senão `typing` ficava preso (o Firefox não
      // avisa ao tirar do ecrã o elemento com o foco) e os separadores e a mensagem fixada não voltavam.
      if (typing) (document.activeElement as HTMLElement | null)?.blur();
      setTab("offer");
    }
    if (!currentOffer) setTab((prev) => (prev === "offer" ? "chat" : prev));
    // No Live, cada oferta nova abre como cartão; a folha da oferta fecha quando ela acaba. No Webinar
    // num telemóvel baixo (iPhone SE, 8), abre já reduzida à barra: inteira, tapava o chat quase todo.
    setOfferMin(!liveLayout && window.matchMedia("(max-width: 767px) and (orientation: portrait) and (max-height: 739px)").matches);
    if (!currentOffer) setSheet((prev) => (prev === "offer" ? null : prev));
  }, [currentOffer?.id]);

  // Contador regressivo da oferta aberta. Fixa-se ao relógio real no instante em que ela abre,
  // para continuar a andar mesmo depois de a transmissão terminar.
  const countdownTotal = currentOffer?.countdown ?? 0;
  const offerWallStartRef = useRef<{ id: string; at: number } | null>(null);
  if (currentOffer && offerWallStartRef.current?.id !== currentOffer.id) {
    offerWallStartRef.current = {
      id: currentOffer.id,
      at: Date.now() - Math.max(0, contentPeak - currentOffer.start) * 1000,
    };
  }
  if (!currentOffer) offerWallStartRef.current = null;
  const offerElapsed = offerWallStartRef.current ? (now - offerWallStartRef.current.at) / 1000 : 0;
  const offerRemaining = Math.max(0, Math.round(countdownTotal - offerElapsed));
  // O botão fecha no último dia (o da principal ou o de cada oferta seguinte), ou quando o cronómetro
  // chega a zero se assim foi escolhido; com «O botão continua», no zero só o cronómetro sai.
  const deadlinePassed =
    currentOffer?.id === "main" ? Boolean(offers?.closed) : offerDeadlinePassed(currentOffer?.deadline, offers?.timezone ?? "UTC", now);
  const timer = offerTimer(countdownTotal, offerRemaining, Boolean(offers?.closeAtZero), deadlinePassed);
  const offerClosed = timer.closed;

  // Notificação de compra visível neste segundo, dentro da janela configurada.
  // Cada notificação tem o seu momento definido à mão, por isso não há janela
  // de tempo: basta a prova social estar ligada.
  const proofWindow = useMemo(() => {
    if (!socialProof?.enabled) return null;
    return { begin: Number.NEGATIVE_INFINITY, stop: Number.POSITIVE_INFINITY };
  }, [socialProof?.enabled]);

  // Cada compra tem o seu lugar na linha de tempo: entra no seu momento, fica
  // o tempo configurado e nunca se sobrepõe à anterior.
  const proofSchedule = useMemo(() => {
    if (!proofWindow) return [];
    const show = Math.max(3, socialProof?.display_seconds ?? 6);
    const gap = Math.max(1, socialProof?.min_interval_seconds ?? 3);
    let cursor = Number.NEGATIVE_INFINITY;
    return purchases
      .filter((p) => p.offset_seconds >= proofWindow.begin && p.offset_seconds <= proofWindow.stop)
      .sort((a, b) => a.offset_seconds - b.offset_seconds)
      .map((purchase) => {
        const from = Math.max(purchase.offset_seconds, cursor + gap);
        cursor = from + show;
        return { purchase, from, to: from + show };
      });
  }, [proofWindow, purchases, socialProof?.display_seconds, socialProof?.min_interval_seconds]);

  // Notificações de compra simuladas: seguem o vídeo e cada uma é entregue uma
  // única vez — recuar no vídeo não as repete.
  const shownPurchasesRef = useRef<Set<string>>(new Set());
  const purchaseArrivalRef = useRef<Record<string, Date>>({});
  // A que está no ecrã fica até ao fim do seu tempo (antes saía ao segundo seguinte).
  const showingPurchaseRef = useRef<string | null>(null);
  const activePurchase = useMemo(() => {
    if (waiting) return null;
    const slot = purchaseOnScreen(proofSchedule, contentSeconds, shownPurchasesRef.current, showingPurchaseRef.current);
    showingPurchaseRef.current = slot?.purchase.id ?? null;
    if (slot) shownPurchasesRef.current.add(slot.purchase.id);
    return slot?.purchase ?? null;
  }, [proofSchedule, contentSeconds, waiting]);

  // Ao voltar à sala, tudo o que já passou do ponto mais avançado visto entra
  // logo no histórico do chat, sem voltar a soar como notificação.
  useEffect(() => {
    if (waiting) return;
    for (const slot of proofSchedule) {
      if (slot.from > contentPeakRef.current) break;
      if (shownPurchasesRef.current.has(slot.purchase.id)) continue;
      shownPurchasesRef.current.add(slot.purchase.id);
      const behind = Math.max(0, contentPeakRef.current - slot.from);
      purchaseArrivalRef.current[`purchase-${slot.purchase.id}`] = new Date(
        Date.now() - behind * 1000,
      );
    }
  }, [proofSchedule, waiting]);

  // Compras reais da Kambafy: lidas de minuto a minuto (a primeira leitura 15 s depois de entrar, para
  // não juntar pedidos no arranque de um live); cada uma aparece quando chega.
  const fetchRealPurchases = useServerFn(getPublicRoomPurchases);
  const [realPurchases, setRealPurchases] = useState<{ id: string; buyer: string; product: string; arrived: Date }[]>([]);
  const realSinceRef = useRef(Date.now() - 10 * 60 * 1000);
  useEffect(() => {
    if (!sales?.real || mode !== "live") return;
    let stopped = false;
    const load = async () => {
      try {
        const rows = await fetchRealPurchases({ data: { webinarId: webinar.id, since: realSinceRef.current } });
        if (stopped || rows.length === 0) return;
        setRealPurchases((prev) => {
          const known = new Set(prev.map((p) => p.id));
          const fresh = rows
            .filter((row) => !known.has(row.id))
            .map((row) => ({ id: row.id, buyer: row.buyer, product: row.product, arrived: new Date() }));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      } catch {
        /* tenta outra vez na próxima volta */
      }
    };
    const first = window.setTimeout(() => void load(), 15_000);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      stopped = true;
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [sales?.real, mode, webinar.id, fetchRealPurchases]);

  // Onde aparecem as compras: no vídeo (aviso), no chat (linha) ou nos dois.
  const showToasts = (sales?.where ?? "both") !== "chat";
  const showChatSales = (sales?.where ?? "both") !== "video";
  const latestReal = realPurchases[realPurchases.length - 1];
  const realActive = latestReal && now - latestReal.arrived.getTime() < 7000 ? latestReal : null;
  const toastPurchase = activePurchase
    ? { name: activePurchase.buyer_name, text: activePurchase.message || `comprou ${activePurchase.product_name}` }
    : realActive
      ? { name: realActive.buyer, text: `comprou ${realActive.product || "a vaga"}` }
      : null;
  // O aviso de compra fica sempre no ecrã do vídeo, no canto de baixo, dentro da moldura (`SALE_TOAST_SPOT`,
  // igual na pré-visualização); a legenda sobe por cima dele. Só no Live com o vídeo ao alto a encher o ecrã
  // (o chat tapa o fundo do vídeo) entra logo acima das mensagens. A posição antiga gravada
  // (`socialProof.position`) já não se escolhe no editor e deixou de contar.
  // Chat oculto (só deitado e no computador; ao alto vê-se sempre): saem o painel e a caixa, mas as
  // mensagens, os corações e a oferta continuam por cima do vídeo (`proof`), e o aviso entra por cima delas.
  // Webinar com o vídeo ao alto e o telemóvel (ou tablet pequeno) deitado: o vídeo não roda. Fica ao alto,
  // ao centro, com a altura toda; ao lado, o aviso para virar o telemóvel e a prova social (como com o chat
  // oculto). Sem caixa de escrever: para comentar, roda-se o telemóvel. No computador nada muda.
  // Só em aparelhos de toque (`coarse`): numa janela estreita do computador o aviso de rodar não faz sentido. Vale já
  // na contagem de arranque (o relógio enche a coluna 9:16, como no Live), para a sala não saltar quando o vídeo entra.
  const turnUp = coarse && !liveLayout && !wide && !portrait && videoShape === "vertical" && !(waiting && !prelive) && !finished;
  const chatHidden = (!chatOpen && (wide || !portrait) && !waiting) || turnUp;
  const toastOverChat = (liveLayout && !liveStack && !wide && portrait && liveBox.place === "fill") || chatHidden;
  // Aí, com as compras também no chat, a linha do chat (logo ali, sobre o vídeo, como no Instagram) já é o
  // aviso: dois iguais colados um ao outro só repetiam.
  const purchaseToast = showToasts && toastPurchase && !(toastOverChat && showChatSales) ? (
    <SaleToast
      name={toastPurchase.name}
      text={toastPurchase.text}
      color={socialProof?.notification_color}
      compact={phoneSize}
      className={toastOverChat ? SALE_TOAST_SPOT.feed : phoneSize ? SALE_TOAST_SPOT.phone : SALE_TOAST_SPOT.desk}
    />
  ) : null;
  // No palco do Live, uma moldura igual à do vídeo, por cima dos véus, só para o aviso.
  const liveToast =
    purchaseToast && !toastOverChat ? <div className={cn(liveBoxClass, "pointer-events-none z-20 shadow-none")}>{purchaseToast}</div> : null;

  // O histórico de comentários segue o ponto mais avançado do vídeo: recuar
  // num replay não apaga o que já foi mostrado.
  const visibleComments = useMemo(
    () => comments.filter((c) => c.offset_seconds <= contentPeak),
    [comments, contentPeak],
  );

  // A hora mostrada é a do momento do vídeo em que o comentário foi dito.
  // Quem entra a meio (ou recarrega) vê o histórico com as horas certas,
  // em vez de tudo a chegar ao mesmo segundo.
  const contentPeakSnapshotRef = useRef(contentPeak);
  contentPeakSnapshotRef.current = contentPeak;

  useEffect(() => {
    setCommentArrival((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const comment of visibleComments) {
        if (!(comment.id in next)) {
          const behind = Math.max(0, contentPeakSnapshotRef.current - comment.offset_seconds);
          next[comment.id] = new Date(Date.now() - behind * 1000);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [visibleComments]);

  useEffect(() => {
    const node = feedRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [visibleComments.length, sent.length, supportMessages.length, tab]);

  // O link vem da base de dados: só http(s) chega ao browser do participante.
  const ctaUrl = currentOffer && isHttpUrl(currentOffer.url) ? currentOffer.url : null;

  // Cada clique leva até ao checkout a origem da pessoa, onde clicou e em que minuto.
  const clickCta = () => {
    if (offerClosed) return;
    // Um grupo (WhatsApp ou Telegram) pede primeiro os dados, para saber quem entrou.
    if (ctaUrl && isGroupLink(ctaUrl)) {
      setGroupOpen(true);
      return;
    }
    setCheckout(true);
    onCtaClick?.();
    if (!ctaUrl) return;
    const link =
      offers?.utm === false
        ? ctaUrl
        : checkoutLink(ctaUrl, { ...checkoutOrigin, place: "sala", seconds: contentSeconds });
    window.open(link, "_blank", "noopener");
  };

  // Uma mensagem que não chegou ao servidor fica à vista, com a opção de repetir.
  const deliver = async (message: SentMessage) => {
    const mark = (failed: boolean) =>
      setSent((prev) => prev.map((m) => (m.id === message.id ? { ...m, failed } : m)));
    mark(false);
    try {
      await onSend(message.text, message.id);
    } catch {
      mark(true);
    }
  };

  const sendMessage = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    // O Safari anterior ao 15.4 não tem randomUUID: o id só precisa de ser único nesta sala.
    const id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const message = { id, text: body, at: new Date() };
    setSent((prev) => [...prev, message]);
    await deliver(message);
  };

  const retryNote = (message: SentMessage) =>
    message.failed ? (
      <button
        type="button"
        onClick={() => void deliver(message)}
        className="text-[12px] font-semibold text-destructive underline underline-offset-2"
      >
        Não enviada. Tentar de novo
      </button>
    ) : null;

  // Durante a contagem a sala continua a encher: a audiência sobe a caminho do
  // arranque, em vez de ficar parada no mesmo número.
  const preliveViewers = (() => {
    const base = Math.max(1, viewers);
    const span = Math.max(1, preliveSeconds);
    const done = Math.min(1, Math.max(0, 1 - untilStart / span));
    const ramp = 0.28 + 0.72 * done ** 1.35;
    const wave = Math.sin(untilStart / 5) * 0.012 + Math.sin(untilStart / 1.7) * 0.006;
    return Math.max(1, Math.round(base * (ramp + wave)));
  })();

  // O «Ao vivo» e quantos vêem ficam sempre no canto do vídeo: também por cima do véu da entrada (z-40),
  // com o teclado aberto e com o chat oculto. Não apanha toques.
  const overlay = (
    <div className="pointer-events-none absolute left-[calc(var(--safe-l,0px)+12px)] right-[calc(var(--safe-r,0px)+12px)] top-3 z-[41] flex items-start justify-between gap-2">
      {/* Selo da referência: vermelho só para AO VIVO; replay a azul; resto neutro. */}
      <span className="flex items-center gap-[5px]">
        {prelive ? null : (
          <LiveBadge
            label={waiting ? "Em breve" : finished ? "Terminou" : mode === "live" ? "Ao vivo" : "Replay"}
            tone={waiting || finished ? "muted" : mode === "live" ? "live" : "replay"}
          />
        )}
        {!finished && audienceFormat !== "off" ? <LiveViewers count={prelive ? preliveViewers : viewers} /> : null}
      </span>
      <span />
    </div>
  );

  const countdown = (() => {
    const remaining = Math.max(0, Math.round(-elapsed));
    const days = Math.floor(remaining / 86400);
    const hours = Math.floor((remaining % 86400) / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    const secs = remaining % 60;
    const parts =
      days > 0
        ? [
            [days, "dias"],
            [hours, "horas"],
            [minutes, "min"],
          ]
        : [
            [hours, "horas"],
            [minutes, "min"],
            [secs, "seg"],
          ];
    return parts as [number, string][];
  })();

  const showPrelive = prelive || preliveEnding;
  // O vídeo arranca sem som atrás do preto; ao ser revelado, recebe o som que a
  // pessoa já autorizou na contagem. Assim nunca aparece parado nem pede play.
  const videoArmed = !prelive && (!preliveEnding || preliveReady);
  useEffect(() => {
    const video = liveVideoRef.current;
    if (!video) return;
    const read = () => {
      if (video.videoWidth && video.videoHeight) setPlayerShape(video.videoWidth >= video.videoHeight ? "horizontal" : "vertical");
    };
    read();
    video.addEventListener("loadedmetadata", read);
    return () => video.removeEventListener("loadedmetadata", read);
  }, [liveLayout, videoArmed]);
  const videoNode = webinar.video_url ? (
    <VideoPlayer
      url={webinar.video_url}
      fit={liveLayout ? liveBox.fit : turnUp ? "contain" : "cover"}
      provider={webinar.video_provider}
      // Nem ao vivo nem em replay se pode avançar ou recuar a sessão.
      controls={false}
      mediaRef={liveVideoRef}
      autoPlay={videoArmed && (soundOn || !saveData)}
      saveData={saveData}
      muted={!videoArmed || (preliveEnding && !preliveReveal) || !soundOn}
      // Um leitor novo (rodar o tablet para o computador) retoma onde a pessoa ia, não no ponto de entrada.
      startAtSeconds={videoSeconds > 0 ? videoSeconds : startAtSeconds}
      // Numa sessão com hora marcada, o vídeo segue o relógio da sessão: quem
      // sai e volta apanha o momento real em vez de ficar com a imagem presa.
      liveTargetSeconds={scheduled && syncWithStart && !waiting && !finished ? timeline : null}
      theme={theme}
      // De ponta a ponta, sem cantos (no tablet e no computador quem corta os cantos é a moldura à volta).
      className={liveLayout || turnUp ? "size-full rounded-none" : "rounded-none"}
      // O iPhone não deixou o som arrancar sozinho: volta o botão de entrar, e o som nasce no toque.
      onSoundBlocked={() => setSoundOn(false)}
      onEnded={() => {
        setVideoEnded(true);
        flushProgress({ final: true });
      }}
      onPause={() => flushProgress()}
      onPlaying={() => {
        if (!preliveEnding || preliveReveal || revealTimerRef.current !== null) return;
        if (playbackFallbackRef.current !== null) {
          window.clearTimeout(playbackFallbackRef.current);
          playbackFallbackRef.current = null;
        }
        // Mantém um breve momento totalmente escuro depois de confirmar que o
        // vídeo já corre por trás; a revelação demora mais um segundo.
        revealTimerRef.current = window.setTimeout(() => {
          setPreliveReveal(true);
          setPreliveBlack(false);
          revealTimerRef.current = null;
          finishTimerRef.current = window.setTimeout(() => {
            setPreliveEnding(false);
            finishTimerRef.current = null;
          }, 1050);
        }, 350);
      }}
      onTime={(value) => {
        if (waiting) return;
        if (value <= 0) return;
        lastVideoRef.current = Date.now();
        setVideoDriven(true);
        // Relógio de conteúdo: tudo o que depende do momento do vídeo segue daqui.
        setVideoSeconds(value);
        if (!scheduled) setSeconds(value);
      }}
    />
  ) : null;

  // As definições do vídeo, como no YouTube: volume, legendas, qualidade e aparência.
  // Sem velocidade nem avançar: a sessão parece sempre ao vivo.
  const changeVolume = (next: number) => {
    setVolume(next);
    if (next > 0 && !soundOn) enableSound();
  };
  const entryKicker = mode === "replay" ? "Replay da aula" : "Aula ao vivo";

  // Ecrã inteiro (Webinar, telemóvel ao alto com o vídeo horizontal, se o organizador o deixou ligado): no Android a
  // sala inteira passa a ecrã inteiro e roda para deitado; no iPhone (sem ecrã inteiro para a página) uma dica
  // de 2,5 s para virar o telemóvel. Em ecrã inteiro o botão fica (para sair), também deitado.
  const [fullscreen, setFullscreen] = useState(false);
  const [turnHint, setTurnHint] = useState(false);
  // Em ecrã inteiro o vídeo enche o ecrã (como no YouTube): a coluna do chat esconde-se e ficam por cima os
  // comentários, o coração e o botão de comentar, que a volta a abrir. Ao sair, o chat volta como estava.
  const chatBeforeFullscreenRef = useRef<boolean | null>(null);
  useEffect(() => {
    const onChange = () => {
      const on = roomRef.current !== null && document.fullscreenElement === roomRef.current;
      setFullscreen(on);
      if (on) {
        setChatOpen((open) => {
          chatBeforeFullscreenRef.current = open;
          return false;
        });
      } else if (chatBeforeFullscreenRef.current !== null) {
        setChatOpen(chatBeforeFullscreenRef.current);
        chatBeforeFullscreenRef.current = null;
      }
      if (!on) {
        try {
          screen.orientation?.unlock?.();
        } catch {
          // Sem bloqueio de rotação no navegador: nada a desfazer.
        }
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    if (!turnHint) return;
    const timer = window.setTimeout(() => setTurnHint(false), 2500);
    return () => window.clearTimeout(timer);
  }, [turnHint]);
  const toggleFullscreen = () => {
    const room = roomRef.current;
    if (!room) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (!document.fullscreenEnabled || typeof room.requestFullscreen !== "function") {
      setTurnHint(true);
      return;
    }
    room
      .requestFullscreen()
      .then(async () => {
        try {
          await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape");
        } catch {
          // O navegador não deixa bloquear a rotação: fica a rotação natural.
        }
      })
      .catch(() => setTurnHint(true));
  };
  // Em ecrã inteiro o botão de sair fica sempre (deitado o ecrã pode passar de 1024 px, ou a forma mudar ao ler-se).
  // Fora dele, só ao alto e só com a forma lida do vídeo: sem leitura (Bunny, Panda, rede lenta) não aparece.
  const fullscreenShown =
    !liveLayout &&
    live.fullscreenButton !== false &&
    !waiting &&
    !finished &&
    !typingNow &&
    (fullscreen || (coarse && !wide && portrait && (playerShape ?? probedShape) === "horizontal"));

  // Com o chat oculto, o canto de baixo à direita é do botão de comentar e do coração: o ⚙ sobe ao de cima.
  // O ⚙ e o ecrã inteiro ficam dentro das zonas seguras (`--safe-r`: o vídeo deitado vai até à borda do ecrã).
  const videoControls = videoNode ? (
    <div className="pointer-events-none absolute inset-0 z-30">
      {turnHint ? <TurnHint /> : null}
      <div className={cn("pointer-events-auto absolute right-[calc(var(--safe-r,0px)+12px)] flex items-center gap-1", chatHidden && !turnUp ? "top-3" : "bottom-3")}>
        {fullscreenShown ? <FullscreenButton on={fullscreen} onToggle={toggleFullscreen} /> : null}
        <VideoSettings
          volume={soundOn ? volume : 0}
          onVolume={changeVolume}
          captions={captionsOn}
          onCaptions={setCaptionsOn}
          hasCaptions={captions.length > 0}
          appearance={appearance}
          onAppearance={(next) => onAppearance?.(next)}
        />
      </div>
    </div>
  ) : null;
  // As frases para as legendas (vazio com as legendas desligadas); `CaptionLine` mostra o pedaço do momento.
  const spoken = captionsOn ? captions : [];

  const needsAudioUnlock =
    !soundOn && !prelive && !waiting && !finished && Boolean(webinar.video_url);

  const status = prelive
    ? null
    : waiting
      ? { label: "Em breve", tone: "muted" as const }
      : finished
        ? { label: "Terminou", tone: "muted" as const }
        : mode === "live"
          ? { label: "Ao vivo", tone: "live" as const }
          : { label: "Replay", tone: "replay" as const };
  const viewerCount = !finished && audienceFormat !== "off" ? (prelive ? preliveViewers : viewers) : null;

  // O temporizador da aula, por cima do vídeo, só com a aula a correr (não na entrada nem na contagem).
  const timerOn = Boolean(videoNode) && !showPrelive && !needsAudioUnlock && !waiting && !finished;
  const lessonTimer = (spots: { bar?: string; chip?: string }) =>
    timerOn ? <LessonTimer timer={live.timer} seconds={contentSeconds} compact={phoneSize} {...spots} /> : null;
  const settings =
    videoNode && !showPrelive && !needsAudioUnlock ? (
      <VideoSettings
        inline
        compact={!wide}
        volume={soundOn ? volume : 0}
        onVolume={changeVolume}
        captions={captionsOn}
        onCaptions={setCaptionsOn}
        hasCaptions={captions.length > 0}
        appearance={appearance}
        onAppearance={(next) => onAppearance?.(next)}
      />
    ) : null;
  // No computador, o selo, quantos vêem e o ⚙ ficam dentro do vídeo, no canto de cima (nunca no preto à volta).
  const cornersInVideo = liveLayout && wide && videoArmed && Boolean(videoNode) && !waiting && !finished;
  // `chat`: o botão de mostrar ou ocultar o painel do chat, ao lado do ⚙.
  const deskCorners = (chat: React.ReactNode) => (
    <>
      <div className={cn("absolute z-20 flex items-center gap-[5px]", cornersInVideo ? "left-3 top-3" : "left-5 top-5")}>
        {status ? <LiveBadge label={status.label} tone={status.tone} /> : null}
        {viewerCount !== null ? <LiveViewers count={viewerCount} /> : null}
      </div>
      {/* No canto, o botão do chat (mostrar ou ocultar o painel da direita) e o ⚙. */}
      <div className={cn("pointer-events-auto absolute z-30 flex items-center gap-2", cornersInVideo ? "right-3 top-3" : "right-5 top-5")}>
        {chat}
        {settings}
      </div>
      {cornersInVideo ? lessonTimer({ bar: "absolute inset-x-0 bottom-0 z-20", chip: "absolute right-3 top-14 z-20" }) : null}
    </>
  );

  // No Live o ecrã de cada estado enche o palco ao alto; no webinar tem a proporção do vídeo.
  // No Webinar, o telemóvel deitado mostra o vídeo em ecrã inteiro, como no YouTube.
  const frame = liveLayout || turnUp ? "size-full" : "aspect-video";
  const liveArea = (
    <div
      className={cn(
        "relative overflow-hidden",
        frame,
        liveLayout ? "" : theme === "light" ? "bg-room-surface" : "bg-black",
      )}
    >
      <div className="relative h-full w-full">
        {/* O leitor só é montado quando a transmissão está armada. Isto impede o
            navegador de desenhar um botão nativo por cima da contagem no refresh. */}
        {liveLayout && liveBox.place === "column" ? <div className={LIVE_COLUMN_BG} /> : null}
        {videoArmed &&
          (liveLayout ? (
            // Regras fixas por aparelho, sem cortar nem esticar o vídeo (ver `liveFrame`).
            // Com o telemóvel deitado, o vídeo fica inteiro e ao centro.
            // Empilhado, a moldura já é o 16:9 do vídeo, no topo da sala.
            <div className={liveBoxClass}>
              {videoNode}
              {/* A legenda e o botão de entrar ficam no próprio vídeo (com o vídeo ao alto, a legenda sobe acima do chat). */}
              {liveBox.place !== "fill" && !showPrelive && !needsAudioUnlock && !chatHidden ? <CaptionLine lines={spoken} t={contentSeconds} compact={!wide} raised={Boolean(purchaseToast)} /> : null}
              {needsAudioUnlock ? (
                <div className={cn("absolute inset-0 grid place-items-center", ENTRY_DIM)}>
                  <EntryPlay look={live.entry} kicker={entryKicker} compact={phoneSize} />
                </div>
              ) : null}
            </div>
          ) : (
            videoNode
          ))}
        {!videoNode && (
          <div className="flex size-full items-center justify-center px-6 text-center text-sm text-room-subtle">
            Sem vídeo associado. Adicione uma fonte na biblioteca.
          </div>
        )}
        {/* Escudo de toque: ninguém consegue pausar nem aparece qualquer botão de
            play/pause — a transmissão parece sempre ao vivo, nunca um vídeo gravado. */}
        {videoNode && <div className="absolute inset-0 z-10 cursor-default" />}
        {testControls && ownVideo && !showPrelive && !needsAudioUnlock ? (
          <TestScrubber
            videoRef={liveVideoRef}
            marks={offerList.map((offer) => offer.start)}
            // Live com o vídeo ao alto a encher o ecrã (a moldura passa as bordas e o chat ocupa o fundo): no palco, em cima.
            className={liveLayout && (wide || !portrait || liveStack) ? liveBoxClass : "absolute inset-y-0 left-[var(--safe-l,0px)] right-[var(--safe-r,0px)]"}
            // Em cima também com o chat oculto: as mensagens, o coração e a oferta ocupam o fundo do vídeo.
            top={chatHidden || (liveLayout && !wide && portrait && !liveStack)}
          />
        ) : null}


        {showPrelive && (
          <div
            className={cn(
              "absolute inset-0 bg-black transition-opacity duration-500",
              preliveEnding ? "opacity-0" : "opacity-100",
            )}
          >
            <PreliveCountdown
              remaining={untilStart}
              total={preliveSeconds}
              message={preliveMessage}
              soundOn={soundOn}
              soundEnabled={preliveSound}
              template={preliveTemplate}
              appearance={preliveAppearance}
              color={preliveColor}
              fill={(liveLayout && !liveStack) || turnUp}
              background={preliveBackground}
            />
          </div>
        )}
        {preliveEnding && (
          <div
            className={cn(
              "pointer-events-none absolute inset-0 z-20 bg-black transition-opacity ease-in-out",
              preliveBlack ? "opacity-100 duration-700" : "opacity-0 duration-1000",
            )}
          />
        )}
        {/* Com o chat oculto, a legenda vai na prova social (`proof`), logo acima das mensagens. */}
        {!showPrelive && !needsAudioUnlock && !chatHidden ? (
          !liveLayout ? (
            <CaptionLine lines={spoken} t={contentSeconds} compact={phoneSize} raised={Boolean(purchaseToast)} />
          ) : liveBox.place === "fill" ? (
            // O vídeo ao alto enche o ecrã e o chat ocupa o fundo: a legenda sobe para o meio.
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[55%]">
              <CaptionLine lines={spoken} t={contentSeconds} compact />
            </div>
          ) : null
        ) : null}
        {!showPrelive && !needsAudioUnlock && !liveLayout && videoControls}
      </div>

      {needsAudioUnlock && (
        // Tocar em qualquer sítio começa a aula; o botão fica ao centro do vídeo, meio escurecido (no Live
        // o botão e o escurecido estão dentro da moldura do vídeo, acima).
        <button
          type="button"
          onClick={enableSound}
          aria-label="Clique aqui para assistir"
          className={cn("absolute inset-0 z-40 grid place-items-center", !liveLayout && ENTRY_DIM)}
        >
          {liveLayout ? null : <EntryPlay look={live.entry} kicker={entryKicker} compact={phoneSize} />}
        </button>
      )}
    </div>
  );

  // Live empilhado: os ecrãs de estado cabem na faixa 16:9 do vídeo, por baixo da barra do Live (letra e
  // espaços menores no telemóvel; a oferta já está no cartão por baixo).
  const strip = liveStack;
  // A espera com o botão do grupo: no telemóvel, a mesma medida apertada da faixa, para tudo caber no 16:9.
  const tight = strip || (phoneSize && Boolean(webinar.group_url));
  const player = showPrelive ? (
    liveArea

  ) : waiting ? (
    <div className={cn("flex flex-col items-center justify-center text-center", frame, tight ? "gap-2 px-4 pb-2 pt-12 md:gap-4 md:pt-16" : "gap-5 px-6")}>
      <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-primary">
        A transmissão começa em
      </p>
      <div className={cn("flex", tight ? "gap-2 md:gap-3" : "gap-3")}>
        {countdown.map(([value, label]) => (
          <div
            key={label}
            className={cn("rounded-2xl bg-room-raised ring-1 ring-room-line", tight ? "min-w-14 px-2.5 py-1.5 md:min-w-20 md:px-4 md:py-3" : "min-w-20 px-4 py-3")}
          >
            <p className={cn("font-black tabular-nums text-room-text", tight ? "text-lg md:text-2xl" : "text-2xl")}>
              {String(value).padStart(2, "0")}
            </p>
            <p className="text-[12px] font-bold uppercase tracking-widest text-room-subtle">
              {label}
            </p>
          </div>
        ))}
      </div>
      <p className={cn("text-room-subtle", tight ? "text-[12px] md:text-sm" : "text-sm")}>Fique por aqui. Entramos no ar à hora marcada.</p>
      {webinar.group_url ? (
        <a
          href={webinar.group_url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-[#25D366] px-5 font-semibold text-[#0B141A] shadow-[0_6px_18px_rgba(37,211,102,.25)] transition hover:brightness-95 active:scale-[.98]",
            tight ? "text-[14px] md:text-[15px]" : "text-[15px]",
          )}
        >
          <img src={whatsappIcon} alt="" className="size-5" />
          Entrar no grupo de WhatsApp
        </a>
      ) : null}
    </div>
  ) : finished && openAfter !== null && !offerClosed ? (
    // Os ecrãs do fim têm letra branca: o fundo é sempre preto (no tema claro, o fundo do vídeo é claro).
    <div className={cn("flex flex-col items-center justify-center bg-black text-center text-white", frame, strip ? "gap-1 px-4 pb-2 pt-12 md:gap-3 md:pt-16" : "gap-3 px-6")}>
      <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-primary">A aula terminou</p>
      <h2 className={cn("font-extrabold text-white", strip ? "text-[17px] leading-tight md:text-3xl" : "text-2xl sm:text-3xl")}>As inscrições continuam abertas</h2>
      <p className={cn("font-mono font-bold tabular-nums text-white", strip ? "text-[22px] md:text-4xl" : "text-3xl sm:text-4xl")}>
        {String(Math.floor(openAfter / 3600)).padStart(2, "0")}:{String(Math.floor((openAfter % 3600) / 60)).padStart(2, "0")}:
        {String(openAfter % 60).padStart(2, "0")}
      </p>
      {strip ? (
        <p className="text-[12px] text-white/80 md:text-sm">A oferta está aqui em baixo.</p>
      ) : (
        <>
          <p className="max-w-md text-sm text-white/80">Garanta a sua vaga no separador Oferta. Dúvidas? A equipa responde no Suporte.</p>
          <button
            type="button"
            onClick={() => {
              setTab("offer");
              setSheet("offer");
            }}
            className="mt-1 h-11 rounded-xl bg-primary px-5 text-[15px] font-bold text-primary-foreground transition hover:brightness-110"
          >
            Ver a oferta
          </button>
        </>
      )}
    </div>
  ) : finished ? (
    <div className={cn("flex flex-col items-center justify-center bg-black text-center text-white", frame, strip ? "gap-1.5 px-4 pb-2 pt-12 md:gap-4 md:pt-16" : "gap-4 px-6")}>
      <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-primary">
        Transmissão terminou
      </p>
      <h2 className={cn("font-extrabold text-white", strip ? "text-[17px] leading-tight md:text-3xl" : "text-2xl sm:text-3xl")}>
        Obrigado por ter estado connosco
      </h2>
      <p className={cn("max-w-md text-white/80", strip ? "text-[12px] md:text-sm" : "text-sm")}>
        A sessão ao vivo chegou ao fim.{" "}
        {ctaVisible && !offerClosed
          ? liveLayout
            ? "A oferta continua disponível aqui em baixo."
            : "A oferta continua disponível no separador Oferta."
          : "Volte para a próxima sessão."}
      </p>
    </div>
  ) : (
    liveArea
  );


  /** Junta o histórico guardado com o que acabou de ser escrito, sem repetir. */
  const supportThread = useMemo(() => {
    const stored = supportMessages.map((m) => ({
      key: m.id,
      text: m.body,
      at: new Date(m.created_at),
      // Equipa e assistente IA respondem do mesmo lado; só o participante é "eu".
      fromTeam: m.sender_kind !== "participant",
      source: undefined as SentMessage | undefined,
    }));
    const known = new Set(stored.filter((m) => !m.fromTeam).map((m) => m.text));
    const pending = sent
      .filter((m) => !known.has(m.text))
      .map((m, index) => ({ key: `pending-${index}`, text: m.text, at: m.at, fromTeam: false, source: m }));
    return [...stored, ...pending].sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [supportMessages, sent]);

  // Respostas da equipa ou do Agente que chegaram depois de a pessoa entrar e que ela ainda não viu.
  const supportOpenNow = liveLayout ? sheet === "support" : tab === "support";
  const supportUnread = supportOpenNow
    ? 0
    : supportThread.filter((m) => m.fromTeam && m.at.getTime() > Math.max(enteredAtRef.current, supportSeenAt)).length;
  useEffect(() => {
    if (supportOpenNow) setSupportSeenAt(Date.now());
  }, [supportOpenNow, supportThread.length]);
  // Se a resposta ficar por ler, o chat avisa a pessoa (só ela vê) ao fim de 20 s, nos dois formatos.
  useEffect(() => {
    if (!live.notify || supportUnread === 0) return;
    const timer = window.setTimeout(() => setNotices((list) => [...list, new Date()]), 20000);
    return () => window.clearTimeout(timer);
  }, [supportUnread, live.notify]);

  /** Compras já anunciadas: entram no chat no seu momento, com a hora correta. */
  const purchaseFeed = useMemo(() => {
    if (!showChatSales || waiting) return [];
    const real = realPurchases.map((p) => ({
      key: `real-${p.id}`,
      author: p.buyer,
      avatarUrl: null as string | null,
      message: `comprou ${p.product || "a vaga"}`,
      at: p.arrived,
      mine: false,
      purchase: true,
      source: undefined as SentMessage | undefined,
    }));
    if (!socialProof?.enabled) return real;
    return [...real, ...proofSchedule
      .filter((slot) => shownPurchasesRef.current.has(slot.purchase.id))
      .map((slot) => {
        const key = `purchase-${slot.purchase.id}`;
        if (!purchaseArrivalRef.current[key]) {
          purchaseArrivalRef.current[key] = new Date();
        }
        return {
          key,
          author: slot.purchase.buyer_name,
          avatarUrl: null as string | null,
          message: slot.purchase.message || `comprou ${slot.purchase.product_name}`,
          at: purchaseArrivalRef.current[key]!,
          mine: false,
          purchase: true,
          source: undefined as SentMessage | undefined,
        };
      })];
  }, [proofSchedule, socialProof?.enabled, activePurchase, waiting, showChatSales, realPurchases]);

  // As pessoas do chat simulado (todas as do guião, iguais para todos): são elas que reagem e respondem
  // a quem escreve de verdade. A reacção sai do id da mensagem, por isso é a mesma em todas as salas.
  // O sítio de cada uma («A ver de Luanda») serve para responder a «De onde estão a ver?».
  const crowd = useMemo<ChatPerson[]>(() => {
    const byName = new Map<string, ChatPerson>();
    for (const c of comments) {
      const person = byName.get(c.author_name) ?? { name: c.author_name, avatarUrl: c.avatar_url ?? null };
      person.place ||= placeOf(c.message);
      byName.set(c.author_name, person);
    }
    return [...byName.values()];
  }, [comments]);
  const echoes = useMemo(() => {
    const out = new Map<string, ReturnType<typeof chatEcho>>();
    if (mode !== "live") return out;
    for (const m of sent) if (!m.failed) out.set(m.id, chatEcho({ id: m.id, text: m.text, author: viewerName, team: Boolean(team) }, crowd));
    for (const m of teamMessages) out.set(m.id, chatEcho({ id: m.id, text: m.text, author: m.name, team: true }, crowd));
    return out;
  }, [mode, sent, teamMessages, crowd, viewerName, team]);

  /** Chat público por ordem cronológica real: o que eu escrevi fica no momento em que escrevi. */
  const chatThread = useMemo(() => {
    type Item = {
      key: string;
      author: string;
      avatarUrl: string | null;
      message: string;
      at: Date;
      mine: boolean;
      purchase: boolean;
      source: SentMessage | undefined;
      /** O selo da equipa («Equipa», «Apresentador»). */
      badge?: string | undefined;
      /** A reacção do chat simulado («❤️ 3»), quando já chegou. */
      reaction?: string | undefined;
    };
    // A reacção e as respostas simuladas entram no seu segundo, depois da mensagem real.
    const echoOf = (id: string, at: Date, key: string) => {
      const echo = echoes.get(id);
      if (!echo) return { reaction: undefined, replies: [] as Item[] };
      const due = (after: number) => now >= at.getTime() + after * 1000;
      return {
        reaction: echo.reaction && due(echo.reaction.after) ? `${echo.reaction.emoji} ${echo.reaction.count}` : undefined,
        replies: echo.replies
          .filter((r) => due(r.after))
          .map((r, i) => ({
            key: `${key}-r${i}`,
            author: r.author,
            avatarUrl: r.avatarUrl,
            message: r.text,
            at: new Date(at.getTime() + r.after * 1000),
            mine: false,
            purchase: false,
            source: undefined,
          })),
      };
    };
    const items: Item[] = [
      ...visibleComments.map((c) => ({
        key: c.id,
        author: c.author_name,
        avatarUrl: c.avatar_url ?? null,
        message: c.message,
        at: commentArrival[c.id] ?? new Date(c.created_at ?? Date.now()),
        mine: false,
        purchase: false,
        source: undefined,
      })),
      ...purchaseFeed,
      ...sent.flatMap((m) => {
        const echo = echoOf(m.id, m.at, `sent-${m.id}`);
        return [
          { key: `sent-${m.id}`, author: viewerName || "Eu", avatarUrl: null, message: m.text, at: m.at, mine: true, purchase: false, source: m, reaction: echo.reaction },
          ...echo.replies,
        ];
      }),
      ...teamMessages.flatMap((m) => {
        const echo = echoOf(m.id, m.arrived, `team-${m.id}`);
        const host = m.role === "apresentador" && webinar.host_avatar_url ? webinar.host_avatar_url : null;
        return [
          { key: `team-${m.id}`, author: m.name, avatarUrl: host, message: m.text, at: m.arrived, mine: false, purchase: false, source: undefined, badge: TEAM_BADGE[m.role], reaction: echo.reaction },
          ...echo.replies,
        ];
      }),
    ];
    return items.sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [visibleComments, commentArrival, sent, viewerName, purchaseFeed, teamMessages, echoes, now, webinar.host_avatar_url]);

  // As compras também entram no chat: a última fica à vista (também no chat por cima do vídeo).
  useEffect(() => {
    for (const node of [feedRef.current, liveFeedRef.current]) if (node) node.scrollTop = node.scrollHeight;
    // O aviso de compra por cima das mensagens (Live com o vídeo ao alto) encolhe o chat: a última continua à vista.
  }, [chatThread.length, liveStack, toastOverChat && Boolean(toastPurchase)]);


  // Quem responde no Suporte (nos dois formatos): a equipa de quem apresenta.
  const supportName = webinar.host_name ? `Equipa de ${webinar.host_name}` : "Equipa";

  // O chat começa em baixo e cresce para cima, como no YouTube: a mensagem mais recente fica
  // sempre junto da caixa de escrever.
  const feed = (
    // Num telemóvel muito baixo com o teclado aberto o painel fica só com a caixa (`@container`, 69 px): a lista sai,
    // senão o espaço dela empurrava a caixa para baixo do teclado.
    <div
      ref={feedRef}
      className={cn(
        // As mais antigas desvanecem em cima (como na pré-visualização): nenhuma fica cortada a meio debaixo da fixada.
        "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain max-md:portrait:pt-5 [mask-image:linear-gradient(transparent,#000_28px)] [@container(max-height:110px)]:hidden",
        phoneLand ? "px-3 py-2" : "px-4 py-4",
      )}
    >
      <div className={cn("mt-auto grid", phoneLand ? "gap-2" : "gap-3.5")}>
        {tab === "chat" ? (
          chatThread.length === 0 ? (
            <p className="py-6 text-center text-[13.5px] text-room-subtle">As mensagens aparecem aqui.</p>
          ) : (
            [...chatThread, ...notices.map((at, i) => ({ key: `notice-${i}`, at, notice: true as const }))]
              .sort((a, b) => a.at.getTime() - b.at.getTime())
              .map((item) =>
              "notice" in item ? (
                <SupportNotice key={item.key} name={viewerName} onOpen={() => setTab("support")} />
              ) : item.purchase ? (
                <SaleLine key={item.key} text={`${item.author} ${item.message}`} color={socialProof?.notification_color} />
              ) : item.mine ? (
                <div key={item.key}>
                  {/* O que a pessoa escreve só ela vê: não chega aos outros nem afecta o lançamento. A equipa
                      escreve para todos, com o seu selo. */}
                  {team ? (
                    <ChatLine author={viewerName} text={item.message} tone="team" badge={TEAM_BADGE[team.role]} reaction={item.reaction} big tight={phoneLand} />
                  ) : (
                    <ChatLine author={viewerName} text={item.message} tone="mine" reaction={item.reaction} big tight={phoneLand} />
                  )}
                  {item.source ? retryNote(item.source) : null}
                </div>
              ) : (
                <ChatLine
                  key={item.key}
                  author={item.author}
                  text={item.message}
                  avatarUrl={item.avatarUrl}
                  tone={item.badge ? "team" : "people"}
                  badge={item.badge}
                  reaction={item.reaction}
                  big
                  tight={phoneLand}
                />
              ),
            )
          )
        ) : (
          <SupportMessages
            thread={supportThread.map((m) => ({ key: m.key, text: m.text, fromTeam: m.fromTeam, note: m.source ? retryNote(m.source) : null }))}
            teamName={supportName}
            empty="Escreva à equipa. A resposta aparece aqui, só para si."
          />
        )}
      </div>
    </div>
  );

  // Na folha do Live o tempo já está no topo da folha: sem os blocos grandes, e o botão de compra fica
  // sempre à vista no fundo da folha (quem rola é a folha).
  // `key`: no separador Oferta, um nó novo (sem ele, o React reaproveitava o da lista do chat, já rolada até ao
  // fundo, e a oferta abria cortada em cima).
  const offerPanel = (inSheet = false) => currentOffer ? (
    <div key="oferta" className={cn(!inSheet && "flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]")}>
      <OfferCard
        productName={currentOffer.product || undefined}
        imageUrl={currentOffer.id === "main" ? webinar.cta_image_url || undefined : undefined}
        priceFrom={currentOffer.priceFrom}
        priceNow={currentOffer.priceNow}
        buttonText={currentOffer.button || "Quero entrar"}
        onBuy={clickCta}
        countdownSeconds={offerRemaining}
        showCountdown={timer.left !== null && !inSheet}
        compact={inSheet}
        // Na folha (um pop-up), a forma compacta: cabe inteira, com o botão sempre à vista.
        look={inSheet ? "compact" : live.offerLook}
        colors={live.offerColors}
        stickyBuy={inSheet}
        closed={offerClosed}
        group={isGroupLink(currentOffer.url)}
        banner={
          openAfter !== null ? (
            <>
              <b className="block font-semibold">A aula terminou, mas as inscrições continuam abertas.</b>
              Fecham daqui a {Math.ceil(openAfter / 60)} min.
            </>
          ) : null
        }
      />
    </div>
  ) : null;

  // Aviso durante a contagem de arranque: o vídeo ainda não entrou no ar e o
  // som precisa de um toque para ser desbloqueado.
  // No Live do telemóvel fica por baixo da barra de cima (em baixo está o chat); no Webinar do telemóvel,
  // pequeno e encostado ao fundo do vídeo, para não tapar o relógio.
  const promptAtTop = liveLayout && !wide && !liveStack;
  const promptSmall = (!liveLayout || liveStack) && !wide;
  const soundPrompt =
    !soundOn && prelive ? (
      <button
        type="button"
        onClick={enableSound}
        className={cn(
          "absolute inset-x-0 z-30 flex items-center justify-center px-4 text-white",
          promptAtTop ? "top-[calc(env(safe-area-inset-top)+58px)]" : promptSmall ? "bottom-0 pb-2 pt-8" : "bottom-0 pb-4 pt-16",
        )}
        // Na cor da contagem, para o aviso fazer parte dela.
        style={{
          background: promptAtTop ? undefined : "linear-gradient(to top, rgba(0,0,0,0.55), transparent)",
          ...(preliveColor ? { "--primary": offerColor(preliveColor), "--primary-foreground": entryPalette(null, offerColor(preliveColor)).buttonText } : null),
        } as React.CSSProperties}
      >
        <span
          className={cn(
            "pointer-events-none flex items-center rounded-full bg-black/70 shadow-xl ring-1 ring-white/20 backdrop-blur",
            promptSmall ? "gap-2 py-1.5 pl-1.5 pr-4" : "gap-3 py-2.5 pl-3 pr-5",
          )}
        >
          <span className={cn("relative flex items-center justify-center rounded-full bg-primary text-primary-foreground", promptSmall ? "size-7" : "size-9")}>
            <Volume2 className={promptSmall ? "size-3.5" : "size-4"} />
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
          </span>
          {/* Só a acção: a contagem por trás já diz que está a começar. */}
          <span className={cn("font-bold leading-tight", promptSmall ? "text-[13px]" : "text-sm")}>Toque para ligar o som</span>
        </span>
      </button>
    ) : null;

  // Com o cartão da oferta por cima do chat (Webinar no telemóvel ao alto), a mensagem fixada da oferta
  // não aparece: o cartão já leva o botão, e as duas juntas tapavam o chat.
  const phoneCard = !liveLayout && phoneTall && Boolean(currentOffer);
  const offerPinActive =
    tab === "chat" &&
    !phoneCard &&
    ctaVisible &&
    !offerClosed &&
    !pinDismissed &&
    (webinar.offer_pin_title?.trim() || webinar.offer_pin_message?.trim());

  const chatPin =
    tab === "chat" && !pinDismissed ? (
      offerPinActive ? (
        <div className={cn("mx-4 flex items-center justify-between gap-3 rounded-md bg-primary/10 px-3.5 ring-1 ring-primary/30", phoneLand ? "mt-2 py-1" : "mt-4 py-2.5")}>
          <div className="flex min-w-0 items-center gap-2">
            <Pin className="size-3.5 shrink-0 text-primary" />
            <p className="truncate text-sm font-semibold text-room-text">
              {webinar.offer_pin_title?.trim() || "Vagas abertas :"}
            </p>
            {ctaUrl ? (
              <a
                href={ctaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-[13px] font-medium text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {webinar.offer_pin_message?.trim() || ctaUrl}
              </a>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setPinDismissed(true)}
            aria-label="Fechar"
            className="shrink-0 rounded-md p-0.5 text-room-subtle transition hover:text-room-text"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : webinar.chat_pin_title ? (
        // A mensagem fixada da etapa Chat do editor (o título; a mensagem longa só vem de dados antigos). O campo
        // vazio no editor é «sem mensagem fixada»: nada entra no lugar dela.
        <ChatPin title={webinar.chat_pin_title} message={webinar.chat_pin_message} onClose={() => setPinDismissed(true)} tight={phoneLand} />
      ) : null
    ) : null;

  // No telemóvel, a sala acompanha a parte visível acima do teclado (visualViewport, no iPhone e no Android):
  // o vídeo fica igual, no mesmo sítio; só a lista do chat encolhe. No Webinar, enquanto se escreve, recolhem o
  // título, os separadores e a mensagem fixada, e a oferta passa à barra (continua à vista), para a caixa de
  // escrever ficar logo acima do teclado. Ao fechar o teclado tudo volta ao sítio.
  // Depois de a sala acabar de mudar de altura (a transição dura 240 ms).
  const feedToEnd = () =>
    window.setTimeout(() => {
      for (const node of [feedRef.current, liveFeedRef.current]) if (node) node.scrollTop = node.scrollHeight;
    }, 300);
  const composerInput: React.InputHTMLAttributes<HTMLInputElement> = {
    onFocus: () => {
      const viewport = window.visualViewport;
      const room = roomRef.current;
      if (viewport && room && (room.classList.contains("live-room-shell--fixed") || !window.matchMedia("(min-width: 1024px)").matches)) {
        setTyping(true);
        room.classList.add("live-room-shell--keyboard");
        // Já se sabe quanto o teclado ocupa: a sala encolhe já, em sincronia com ele; senão, espera pela área visível.
        const known = keyboardHeightRef.current;
        const height = known > 120 && known < window.innerHeight * 0.7 ? window.innerHeight - known : viewport.height;
        room.style.setProperty("--room-visible-height", `${Math.round(height)}px`);
        room.style.setProperty("--room-visible-top", `${Math.round(viewport.offsetTop)}px`);
        window.scrollTo({ top: 0, behavior: "instant" });
      }
      feedToEnd();
    },
    onBlur: () => {
      setTyping(false);
      roomRef.current?.classList.remove("live-room-shell--keyboard");
      // Num ecrã baixo a lista saiu enquanto se escrevia (e o que chegou não a fez descer): volta no fim.
      feedToEnd();
    },
  };

  // A oferta aberta como cartão (Live, e Webinar no telemóvel ao alto), na forma escolhida no editor.
  const cardOffer = currentOffer
    ? {
        product: currentOffer.product,
        priceFrom: currentOffer.priceFrom,
        priceNow: currentOffer.priceNow,
        button: currentOffer.button || "Quero minha vaga",
        countdown: timer.left,
        closed: offerClosed,
        image: currentOffer.id === "main" ? webinar.cta_image_url : null,
        look: live.offerLook,
        colors: live.offerColors,
        group: isGroupLink(currentOffer.url),
      }
    : null;
  // Webinar no telemóvel ao alto: o cartão sobe por cima do chat; reduzido, fica uma barra. A seta da
  // barra só volta a abrir o cartão ali mesmo; a oferta inteira abre no separador Oferta (o que pisca)
  // ou ao puxar o cartão para cima.
  // Com o teclado aberto, a barra (o cartão inteiro empurrava a caixa de escrever para baixo do teclado); num
  // telemóvel muito baixo, nem a barra cabe: sai enquanto se escreve, para a caixa nunca ficar tapada.
  // Deitado, enquanto se escreve, os separadores saem (e com eles o da Oferta): a barra fica na coluna.
  const phoneOffer =
    (phoneCard || (!liveLayout && phoneLand && typingNow)) && tab === "chat" && cardOffer ? (
      <div className="shrink-0 px-3 pb-2.5 [@container(max-height:150px)]:hidden">
        {offerMin || typingNow ? (
          <LiveOfferSlim offer={cardOffer} onOpen={() => setOfferMin(false)} />
        ) : (
          <LiveOfferCard offer={cardOffer} onBuy={clickCta} onMinimize={() => setOfferMin(true)} onExpand={() => setTab("offer")} panel />
        )}
      </div>
    ) : null;

  // No Live do telemóvel o chat já está por cima do vídeo: a folha só tem o Suporte e a Oferta.
  const sheetMode = liveLayout && !wide;
  const panel = (
    <div className="room-panel flex min-h-0 flex-1 flex-col bg-room-bg text-room-text [container-type:size] md:portrait:rounded-2xl md:portrait:ring-1 md:portrait:ring-inset md:portrait:ring-room-line/60 lg:rounded-2xl lg:ring-1 lg:ring-inset lg:ring-room-line/60">
      {typingNow ? null : <RoomTabs
        tight={phoneLand}
        active={tab}
        onTab={setTab}
        items={[
          ...(sheetMode ? [] : [{ value: "chat" as const, label: "Chat", Icon: MessagesSquare }]),
          ...(team ? [] : [{
            value: "support" as const,
            label: "Suporte",
            Icon: Headset,
            extra: supportUnread > 0 ? (
              <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[12px] font-bold leading-none text-primary-foreground">
                {supportUnread}
              </span>
            ) : null,
          }]),
          ...(ctaVisible ? [{ value: "offer" as const, label: "Oferta", Icon: ShoppingCart, extra: tab !== "offer" ? <PulseDot /> : null }] : []),
        ]}
        trailing={
          // Deitado e no computador, o chat oculta-se aqui (volta no botão por cima do vídeo).
          <button
            type="button"
            onClick={() => setChatOpen(false)}
            aria-label="Ocultar o chat"
            title="Ocultar o chat"
            className="hidden size-9 shrink-0 place-items-center rounded-full text-room-subtle transition hover:text-room-text max-lg:landscape:grid lg:grid"
          >
            <X className="size-5" />
          </button>
        }
      />}
      {typingNow ? null : chatPin}
      {tab === "offer" ? offerPanel() : feed}
      {phoneOffer}
      {mode === "replay" && tab !== "offer" ? (
        <p className="border-t border-room-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-xs text-room-subtle">
          Esta é uma gravação. O chat está fechado — vê as mensagens tal como aconteceram ao vivo.
        </p>
      ) : null}
      {tab === "offer" || mode === "replay" ? null : (
        // Deitado, a caixa e o coração descem até junto da barra do aparelho (sem lhe tocar).
        <div className="pb-[max(0px,env(safe-area-inset-bottom))] phone-land:pb-[max(0px,calc(env(safe-area-inset-bottom)-12px))]">
          <ChatComposer
            value={text}
            onChange={setText}
            onSubmit={() => void sendMessage()}
            placeholder={tab === "support" ? "Escreva à equipa…" : "Escreva no chat…"}
            compact={phoneSize}
            tight={phoneLand}
            withReactions={tab === "chat"}
            onHeart={sendHeart}
            reactions={reactions}
            inputProps={composerInput}
          />
        </div>
      )}
    </div>
  );

  const groupDialog =
    groupOpen && currentOffer && ctaUrl ? (
      <GroupJoinDialog
        product={currentOffer.product}
        host={webinar.host_name ?? ""}
        prefill={{ name: prefill?.name || viewerName, email: prefill?.email ?? "", phone: prefill?.phone ?? "" }}
        onClose={() => setGroupOpen(false)}
        onJoin={(data) => {
          setGroupOpen(false);
          setCheckout(true);
          onJoinGroup?.(data);
          window.open(ctaUrl, "_blank", "noopener");
        }}
      />
    ) : null;

  // As redes de quem apresenta, nos dois formatos. No telemóvel abrem na app; no computador numa janela pequena ao lado.
  const platform =
    typeof navigator === "undefined" ? "other" : /Android/i.test(navigator.userAgent) ? "android" : /iPhone|iPad|iPod/i.test(navigator.userAgent) ? "ios" : "other";
  const networks = FOLLOW_NETWORKS.filter((n) => live.links[n.id]).map((n) => {
    const web = followWebLink(n.id, live.links[n.id] ?? "");
    return { id: n.id, name: n.name, handle: profileHandle(web), web, href: wide ? web : followAppLink(n.id, web, platform), done: Boolean(tapped[n.id]) };
  });
  const followLabel = networks.length === 1 && networks[0]?.id === "youtube" ? "Subscrever" : "Seguir";
  // O + Seguir só aparece nos momentos escolhidos (quando o apresentador pede para seguir), nunca durante a oferta.
  const followShown =
    networks.length > 0 && !(followed && live.hideFollowed) && !currentOffer && !prelive && !waiting && !finished && followMomentAt(live.moments, contentPeak);
  const openFollow = networks.length ? () => setSheet("follow") : undefined;
  const follow = followShown ? { label: followLabel, onClick: () => setSheet("follow") } : null;
  const closeSheet = () => {
    if (sheet === "follow" && networks.some((n) => n.done)) {
      setFollowed(true);
      try {
        window.localStorage.setItem(followKey, "1");
      } catch {
        // Sem armazenamento, só fica escondido até sair da sala.
      }
    }
    setSheet(null);
  };
  const followHost = { name: webinar.host_name ?? "", avatarUrl: webinar.host_avatar_url ?? "", verified: hostVerified };
  const followSheet =
    sheet === "follow" ? (
      <LiveFollowSheet
        host={followHost}
        networks={networks}
        note={wide ? "Cada rede abre numa janela pequena ao lado. A aula continua aqui." : "Cada rede abre diretamente na app. A aula continua aqui."}
        onClose={closeSheet}
        onTap={(id, event) => {
          const row = networks.find((n) => n.id === id);
          if (wide && row) {
            const w = 480;
            const h = Math.min(780, window.screen.availHeight - 80);
            const win = window.open(row.web, `cw-${id}`, `popup,width=${w},height=${h},left=${Math.max(0, window.screen.availWidth - w - 40)},top=40`);
            if (win) event.preventDefault();
          }
          setTapped((prev) => ({ ...prev, [id]: true }));
        }}
      />
    ) : null;

  // O chat por cima do vídeo (o Live, e o chat oculto nos dois formatos), com o aviso do Suporte no seu momento.
  const feedItems: LiveFeedItem[] = [
    ...chatThread.map((item) => ({
      at: item.at.getTime(),
      item: item.purchase
        ? ({ key: item.key, kind: "sale", text: `${item.author} ${item.message}`, color: socialProof?.notification_color } as const)
        : item.mine
          ? ({
              key: item.key,
              kind: "mine",
              name: viewerName,
              text: item.message,
              note: item.source ? retryNote(item.source) : null,
              reaction: item.reaction,
              team: team ? { name: viewerName, badge: TEAM_BADGE[team.role] } : undefined,
            } as const)
          : ({ key: item.key, kind: "msg", author: item.author, text: item.message, badge: item.badge, reaction: item.reaction } as const),
    })),
    ...notices.map((at, i) => ({ at: at.getTime(), item: { key: `notice-${i}`, kind: "notice", name: viewerName } as const })),
  ]
    .sort((a, b) => a.at - b.at)
    .map((x) => x.item);

  // O botão de comentar (chat oculto, Webinar): a coluna do chat volta e a caixa de escrever fica logo com o foco.
  // `flushSync` mostra a coluna dentro do próprio toque: só assim o iPhone deixa abrir o teclado.
  const openChatToWrite = () => {
    flushSync(() => {
      setChatOpen(true);
      if (tab === "offer") setTab("chat");
    });
    roomRef.current?.querySelector<HTMLInputElement>("aside form input")?.focus();
  };

  // Chat oculto: a prova social por cima do vídeo (o gatilho da manada nunca sai do ecrã). Abrir a oferta
  // inteira volta a mostrar o chat, onde ela está (separador no Webinar, folha no Live).
  const proof = chatHidden ? (
    <LiveProof
      items={feedItems}
      toast={purchaseToast}
      caption={!showPrelive && !needsAudioUnlock ? <CaptionLine lines={spoken} t={contentSeconds} compact={phoneSize} flow /> : null}
      onNotice={() => {
        setChatOpen(true);
        if (liveLayout) setSheet("support");
        else setTab("support");
      }}
      // Com o vídeo ao alto deitado, o coração vai para o canto de baixo à direita (do outro lado do vídeo).
      onHeart={turnUp ? undefined : sendHeart}
      reactions={reactions}
      // Webinar: o botão de voltar ao chat junto do coração (deitado com o vídeo ao alto não há chat: roda-se).
      comment={liveLayout || turnUp ? null : <ChatToggle open={false} onToggle={openChatToWrite} alert={ctaVisible || supportUnread > 0} />}
      panel={turnUp}
      offer={
        // Antes do toque de entrar a oferta espera: o cartão tapava parte do «Assistir agora».
        cardOffer && !needsAudioUnlock ? (
          offerMin || (!liveLayout && phoneLand && !turnUp && landCardFor !== currentOffer?.id) ? (
            <LiveOfferSlim
              offer={cardOffer}
              onOpen={() => {
                setOfferMin(false);
                setLandCardFor(currentOffer?.id ?? null);
              }}
            />
          ) : (
            <LiveOfferCard
              offer={cardOffer}
              onBuy={clickCta}
              onMinimize={() => setOfferMin(true)}
              onExpand={
                turnUp
                  ? undefined
                  : () => {
                      setChatOpen(true);
                      if (liveLayout) setSheet("offer");
                      else setTab("offer");
                    }
              }
              panel={turnUp}
            />
          )
        ) : null
      }
    />
  ) : null;

  if (liveLayout) {
    const host = followHost;

    const liveOffer = cardOffer;
    const offerCardOpen = Boolean(liveOffer) && !offerMin && sheet !== "offer";
    // O chat no tema da sala (painel do computador, ou por baixo do vídeo empilhado); senão, branco por cima do vídeo.
    const themed = wide || liveStack;

    const pin =
      !currentOffer && webinar.chat_pin_message && !pinDismissed ? (
        <div className={cn("mt-2 flex items-start gap-2 rounded-xl px-3 py-2", themed ? "bg-room-raised text-room-text" : "bg-black/40 text-white backdrop-blur-md")}>
          <Pin className="mt-0.5 size-3.5 shrink-0" />
          <p className="min-w-0 flex-1 text-[13px] leading-snug">
            <b className="font-[600]">{webinar.chat_pin_title || "Participe no chat!"}</b> {webinar.chat_pin_message}
          </p>
          <button type="button" onClick={() => setPinDismissed(true)} aria-label="Fechar" className="shrink-0 opacity-75 hover:opacity-100">
            <X className="size-4" />
          </button>
        </div>
      ) : null;

    // A parte de baixo: o chat, a oferta (cartão ou barra) e a caixa de escrever.
    // No tablet ao alto, o chat e a oferta ficam numa coluna à escala de um telemóvel; a linha de escrever
    // vai de margem a margem, com o coração no canto de baixo à direita.
    const lower = (
      <>
        <div
          className={cn(
            "contents",
            // Tablet ao alto: empilhado, o chat a toda a largura; por cima do vídeo, uma coluna larga à esquerda.
            !wide && "md:portrait:flex md:portrait:flex-col",
            !wide && (liveStack ? "md:portrait:min-h-0 md:portrait:w-full md:portrait:flex-1" : "md:portrait:w-[min(620px,100%)]"),
          )}
        >
          {toastOverChat ? purchaseToast : null}
          <LiveFeed
            feedRef={liveFeedRef}
            items={feedItems}
            onNotice={() => setSheet("support")}
            panel={themed}
            big={bigChat}
            className={
              wide
                ? "min-h-0 flex-1 pr-0"
                : liveStack
                  ? // Empilhado: o chat enche o espaço entre o vídeo e a caixa de escrever (as novas junto à caixa).
                    // Só cinco linhas deixavam meio ecrã em branco no telemóvel (visto a 9/10).
                    "min-h-0 flex-1"
                  : // Por cima do vídeo, cinco linhas; deitado, a coluna da direita de cima a baixo.
                    // No tablet ao alto, mais linhas (sobrava meio ecrã de vídeo sem conversa).
                    cn(LIVE_FEED_LINES, "md:portrait:max-h-[300px] max-lg:landscape:max-h-none max-lg:landscape:min-h-0 max-lg:landscape:flex-1")
            }
          />
          {pin}
          {liveOffer && offerCardOpen ? (
            <LiveOfferCard offer={liveOffer} onBuy={clickCta} onMinimize={() => setOfferMin(true)} onExpand={() => setSheet("offer")} panel={themed} />
          ) : null}
          {/* Reduzida: a seta volta a abrir o cartão no mesmo sítio (a folha abre no saco que pisca). */}
          {liveOffer && !offerCardOpen && sheet !== "offer" ? <LiveOfferSlim offer={liveOffer} onOpen={() => setOfferMin(false)} /> : null}
        </div>
        {mode === "replay" ? (
          <p className={cn("mt-3 text-center text-xs", themed ? "text-room-subtle" : "text-white/75")}>Esta é uma gravação. O chat está fechado.</p>
        ) : (
          <LiveComposer
            value={text}
            onChange={setText}
            onSubmit={() => void sendMessage()}
            inputProps={composerInput}
            bag={liveOffer ? { blink: !offerCardOpen && sheet !== "offer", onClick: () => setSheet("offer") } : null}
            support={team ? null : { unread: supportUnread, open: sheet === "support", onClick: () => setSheet(sheet === "support" ? null : "support") }}
            onHeart={sendHeart}
            reactions={reactions}
            panel={themed}
            big={bigChat}
          />
        )}
      </>
    );

    // O Suporte com caixa de escrever: a conversa toda (perguntas e respostas), como no separador do Webinar.
    // Empilhado, enche a zona dos comentários por baixo do vídeo; nos outros desenhos sobe como as outras folhas.
    const supportSheet =
      sheet === "support" ? (
        <LiveSupportSheet
          thread={supportThread.map((m) => ({ key: m.key, text: m.text, fromTeam: m.fromTeam, note: m.source ? retryNote(m.source) : null }))}
          teamName={supportName}
          full={liveStack}
          composer={{ value: text, onChange: setText, onSubmit: () => void sendMessage(), inputProps: composerInput }}
          onClose={closeSheet}
        />
      ) : null;
    const sheets = (
      <>
        {liveStack ? null : supportSheet}
        {sheet === "offer" && currentOffer ? (
          <LiveOfferSheet countdown={liveOffer?.countdown ?? null} closed={offerClosed} onClose={closeSheet} onSupport={team ? undefined : () => setSheet("support")}>
            {offerPanel(true)}
          </LiveOfferSheet>
        ) : null}
        {followSheet}
      </>
    );

    // Telemóvel ou tablet deitado (fora do computador): o vídeo à esquerda e o chat numa coluna à direita.
    const land = !liveStack && !portrait;
    // O escurecido de baixo só onde o chat fica por cima do vídeo (ao alto); deitado, o chat está ao lado.
    const shades = (
      <>
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[120px] bg-[linear-gradient(180deg,rgba(0,0,0,.24),rgba(0,0,0,.07)_55%,transparent)]" />
        {land ? null : <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[42%]" style={{ background: LIVE_SCRIM }} />}
      </>
    );

    const chatToggle = <ChatToggle open={chatOpen} onToggle={() => setChatOpen((o) => !o)} alert={ctaVisible || supportUnread > 0} />;
    // A barra de cima do Live (foto, nome, «Ao vivo», quantos vêem, o botão do chat deitado e o ⚙).
    // O temporizador por baixo dela, à direita (antes dela, para o menu do ⚙ ficar por cima); sem o vídeo
    // deitado em cima, a barra fina vai ao topo, como nas histórias do Instagram.
    const liveTop = (
      <>
        {lessonTimer({ chip: "absolute right-0 top-full mt-2", ...(liveStack ? {} : { bar: "absolute inset-x-0 -top-1.5 rounded-full" }) })}
        <LiveTopBar
          host={host}
          follow={follow}
          onHost={openFollow}
          status={status}
          viewers={viewerCount}
          // O vídeo ao alto num ecrã deitado é estreito: só a foto, «Ao vivo» e os botões.
          slim={land && videoShape === "vertical"}
          extra={
            <>
              {/* Deitado: mostrar ou ocultar a coluna do chat (ao alto vê-se sempre). */}
              {land ? <ChatToggle open={chatOpen} onToggle={() => setChatOpen((o) => !o)} alert={ctaVisible || supportUnread > 0} className="size-9" /> : null}
              {settings}
            </>
          }
        />
      </>
    );
    if (wide) {
      // Computador: ecrã inteiro. O vídeo (16:9 ou 9:16) fica inteiro à esquerda, em fundo preto; o
      // painel à direita vai de cima a baixo e segue o tema da sala.
      return (
        <main
          ref={roomRef}
          className={cn("live-room-shell live-room-shell--stage room-ambient min-h-dvh overflow-hidden bg-black text-room-text", theme === "light" && "room-light")}
          style={liveOfferVars(live.offerColor)}
        >
          <RoomPartsStyle />
          <LiveStyle />
          <div className="flex h-dvh">
            <section className="relative min-w-0 flex-1 overflow-hidden bg-black text-white [container-type:size]">
              {player}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[120px] bg-[linear-gradient(180deg,rgba(0,0,0,.24),rgba(0,0,0,.07)_55%,transparent)]" />
              {/* Uma moldura igual à do vídeo, por cima de tudo, só para os cantos (o escudo de toque fica por baixo). */}
              {cornersInVideo ? <div className={cn(liveBox.box, "pointer-events-none z-30 shadow-none")}>{deskCorners(chatToggle)}</div> : deskCorners(chatToggle)}
              {/* Chat oculto: as mensagens, os corações e a oferta por cima do vídeo, dentro da moldura dele. */}
              {proof ? <div className={cn(cornersInVideo ? liveBox.box : "absolute inset-0", "pointer-events-none z-20 shadow-none")}>{proof}</div> : null}
              {soundPrompt}
              {liveToast}
            </section>
            <aside className={cn("relative flex h-full shrink-0 flex-col border-l border-room-line/60 bg-room-bg", bigChat ? "w-[440px]" : "w-[400px]", !chatOpen && "hidden")}>
              <LivePanelHead title={webinar.public_title} host={host} follow={follow} onHost={openFollow} />
              <div className="flex min-h-0 flex-1 flex-col px-4 pb-4">{lower}</div>
              {sheets}
            </aside>
          </div>
          {groupDialog}
        </main>
      );
    }

    // Telemóvel e tablet: uma só árvore para os dois desenhos, para o leitor nunca mudar de sítio ao rodar o
    // aparelho (um <video> novo voltava ao ponto de entrada e, no iPhone, ficava sem som).
    // Empilhado (`liveStack`, vídeo deitado num ecrã ao alto, como no YouTube): a zona da câmara no tema da
    // sala; o vídeo a toda a largura, sem borda, com a barra do Live por dentro; por baixo, o chat (ocupa o
    // espaço todo) e a caixa de escrever no fundo, no tema da sala. O vídeo fica escuro nos dois temas
    // (`prelive-dark`). Palco ao alto (vídeo ao alto): o vídeo enche o ecrã e o chat fica por cima. Deitado
    // (`land`): o vídeo inteiro à esquerda, com a barra do Live dentro da moldura dele, e o chat numa coluna à
    // direita que não o tapa.
    return (
      <main
        ref={roomRef}
        className={cn(
          // `--fixed`: esta árvore vive sempre presa à área visível, também num tablet com mais de 1024 px.
          "live-room-shell live-room-shell--fixed group/room room-ambient relative flex h-dvh flex-col overflow-hidden",
          liveStack ? "text-room-text" : "live-room-shell--stage bg-black text-white",
          theme === "light" && "room-light",
        )}
        style={liveOfferVars(live.offerColor)}
      >
        <RoomPartsStyle />
        <LiveStyle />
        {liveStack ? <div className="h-[env(safe-area-inset-top)] shrink-0 bg-black" /> : null}
        <div
          className={
            liveStack
              ? "relative shrink-0"
              : "relative min-h-0 flex-1 overflow-hidden bg-black [--live-top:env(safe-area-inset-top)] [container-type:size]"
          }
        >
          <div
            className={
              liveStack
                ? // 16:9 à largura do ecrã (altura explícita, para animar). Com o teclado aberto o vídeo encolhe para
                  // um terço da área visível, devagar, e o chat fica com o resto: antes sobravam duas linhas.
                  "prelive-dark relative h-[56.25vw] w-full overflow-hidden bg-black text-white transition-[height] duration-[240ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] group-[.live-room-shell--keyboard]/room:h-[calc(var(--room-visible-height,100dvh)*0.32)]"
                : land
                  ? // Deitado: o vídeo à esquerda, inteiro; o chat na coluna da direita, sem o tapar (como no Twitch).
                    // As unidades cq do vídeo medem esta área.
                    cn("absolute inset-y-0 left-[env(safe-area-inset-left)] z-30 [container-type:size]", chatOpen ? LIVE_LAND_RIGHT : "right-[env(safe-area-inset-right)]")
                  : "absolute inset-0"
            }
          >
            {player}
            {liveStack ? (
              // Só um véu leve em cima, para o nome se ler sobre qualquer vídeo (sem faixa nem borda).
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-[linear-gradient(180deg,rgba(0,0,0,.22),transparent)]" />
            ) : (
              shades
            )}
            {soundPrompt}
            {liveStack ? purchaseToast : liveToast}
            {liveStack ? lessonTimer({ bar: "absolute inset-x-0 bottom-0 z-20" }) : null}
            {land ? (
              // A barra do Live dentro da moldura do vídeo (nunca no preto à volta) e, com o chat oculto, a prova social.
              // O vídeo ao alto é estreito: aí a prova social fica no preto ao lado dele, sem o tapar.
              <>
                <div className={cn(liveBoxClass, "pointer-events-none z-40 shadow-none")}>
                  <div className="pointer-events-auto absolute inset-x-2.5 top-2.5">{liveTop}</div>
                  {videoShape === "vertical" ? null : proof}
                </div>
                {videoShape === "vertical" ? proof : null}
              </>
            ) : null}
          </div>
          {/* A barra do Live dentro do vídeo, encostada às margens (como no Instagram), por cima de tudo: o menu do ⚙ abre por baixo dela, dentro do ecrã. */}
          {land ? null : (
            <div
              className={
                liveStack
                  ? "absolute inset-x-3 top-2 z-40 md:inset-x-5 md:top-4"
                  : "absolute inset-x-3 top-[calc(env(safe-area-inset-top)+10px)] z-40 md:portrait:inset-x-5 md:portrait:top-[calc(env(safe-area-inset-top)+16px)]"
              }
            >
              {liveTop}
            </div>
          )}
          {liveStack ? null : (
            <>
              {/* Em baixo, o chat. No tablet ao alto, numa coluna à esquerda com a largura de um telemóvel (ver `lower`); deitado, à direita, de cima a baixo (como no YouTube). */}
              <div
                className={
                  land
                    ? // Deitado: a coluna da direita, de cima a baixo, ao lado do vídeo (oculta-se no botão da barra).
                      cn(
                        "absolute inset-y-0 right-0 z-20 flex flex-col justify-end pb-[max(10px,env(safe-area-inset-bottom))] pl-1 pr-[max(12px,env(safe-area-inset-right))] pt-3",
                        LIVE_LAND_COL,
                        !chatOpen && "hidden",
                      )
                    : "absolute inset-x-3.5 bottom-[max(10px,env(safe-area-inset-bottom))] z-20 flex flex-col md:portrait:inset-x-5 md:portrait:bottom-[max(20px,env(safe-area-inset-bottom))]"
                }
              >
                {lower}
              </div>
              {sheets}
            </>
          )}
        </div>
        {liveStack ? (
          <>
            {/* A zona dos comentários é o contentor do Suporte: a folha enche-a e o vídeo fica à vista por cima. */}
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 flex-col justify-end px-3.5 pb-[max(10px,env(safe-area-inset-bottom))] pt-3 md:px-5 md:pb-[max(20px,env(safe-area-inset-bottom))]">
                {lower}
              </div>
              {supportSheet}
            </div>
            {sheets}
          </>
        ) : null}
        {groupDialog}
      </main>
    );
  }
  return (
    <main
      ref={roomRef}
      className={`${theme === "light" ? "room-light " : ""}live-room-shell group/room room-ambient flex flex-col overflow-hidden text-room-text lg:min-h-dvh lg:overflow-visible`}
      style={liveOfferVars(live.offerColor)}
    >
      <RoomPartsStyle />
      <LiveStyle />
      {/* A zona da câmara do iPhone é sempre preta, como o vídeo logo por baixo (o tema muda o resto). */}
      <div className="h-[env(safe-area-inset-top)] shrink-0 bg-black lg:hidden" />
      <div
        className={cn(
          "relative mx-auto flex min-h-0 w-full max-w-[1500px] flex-1 flex-col md:portrait:gap-4 md:portrait:p-6 max-lg:landscape:flex-row lg:grid lg:items-start lg:gap-6 lg:p-6",
          // Teclado aberto ao alto num telemóvel baixo: o vídeo não encolhe, por isso o que não cabe sai por cima (o topo
          // do vídeo) e nunca por baixo (a caixa de escrever fica sempre à vista, logo acima do teclado).
          "group-[.live-room-shell--keyboard]/room:portrait:justify-end",
          chatOpen ? "lg:grid-cols-[minmax(0,1fr)_380px]" : "lg:grid-cols-1",
        )}
      >
        {/* Deitado (telemóvel e tablet), como no Twitch: o vídeo inteiro à esquerda, entre as zonas seguras,
            e o chat do outro lado, numa coluna que não o tapa (oculta-se no X dos separadores). */}
        <section
          className={cn(
            // Deitado, à volta do vídeo o mesmo fundo do chat (claro: branco nos dois); só a borda do chat os separa.
            // O vídeo deitado vai até à borda do ecrã (por baixo da ilha da câmara, como o YouTube a encher) e até à coluna
            // do chat; o que fica por cima dele (AO VIVO, ⚙, mensagens, oferta) respeita as zonas seguras (`--safe-l/r`).
            "relative flex min-w-0 shrink-0 flex-col max-lg:landscape:flex-1 max-lg:landscape:justify-center max-lg:landscape:bg-room-bg phone-land:items-center phone-land:[container-type:size]",
            // Teclado aberto deitado: esta coluna fica com a altura do ecrã (o teclado passa por cima), para o vídeo
            // não encolher nem sair do sítio; só a coluna do chat acompanha a parte visível.
            "group-[.live-room-shell--keyboard]/room:max-lg:landscape:h-dvh",
            turnUp && "items-center pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] [container-type:size]",
            // Chat oculto no computador: o vídeo cresce até caber na altura do ecrã, ao centro.
            !chatOpen && "lg:w-full lg:max-w-[calc((100dvh-11rem)*16/9)] lg:justify-self-center",
          )}
        >
          <div
            className={cn(
              // No telemóvel ao alto o vídeo vai de ponta a ponta, sem borda, como no YouTube.
              "room-panel relative md:ring-1 md:ring-room-line md:portrait:overflow-hidden md:portrait:rounded-2xl max-lg:landscape:ring-0 lg:overflow-hidden lg:rounded-2xl",
              // O vídeo ao alto num ecrã deitado: a altura toda, na sua forma, ao centro.
              turnUp
                ? "h-[100cqh] w-[56.25cqh]"
                : // As zonas seguras só contam onde o vídeo chega à borda do ecrã: menos a folga dele ao centro (cq = a secção).
                  cn(
                    "phone-land:w-[min(100cqw,177.78cqh)] phone-land:[--safe-l:max(0px,calc(env(safe-area-inset-left)_-_(100cqw_-_min(100cqw,177.78cqh))_/_2))]",
                    chatHidden && "phone-land:[--safe-r:max(0px,calc(env(safe-area-inset-right)_-_(100cqw_-_min(100cqw,177.78cqh))_/_2))]",
                  ),
              theme === "light" ? "bg-room-surface" : "bg-black md:shadow-[0_30px_80px_-20px_rgb(0_0_0/0.8)]",
            )}
          >
            {overlay}
            {player}
            {lessonTimer({
              bar: "absolute inset-x-0 bottom-0 z-10",
              // No canto de cima à direita (com o chat oculto, à esquerda do ⚙).
              chip: cn("absolute top-3 z-10", chatHidden && !turnUp ? "right-[calc(var(--safe-r,0px)+64px)]" : "right-[calc(var(--safe-r,0px)+12px)]"),
            })}
            {soundPrompt}
            {/* Com o chat oculto, o aviso vai por cima das mensagens (`proof`), com o botão de voltar ao chat
                junto do coração, no canto de baixo à direita. Com o vídeo ao alto deitado, a prova fica ao lado.
                Dentro das zonas seguras: o vídeo deitado vai até à borda do ecrã. */}
            {turnUp ? null : (
              <div className="pointer-events-none absolute inset-y-0 left-[var(--safe-l,0px)] right-[var(--safe-r,0px)] z-20">
                {chatHidden ? proof : purchaseToast}
              </div>
            )}
          </div>
          {turnUp ? (
            <>
              <div className="absolute inset-y-0 left-[env(safe-area-inset-left)] w-[calc((100cqw-56.25cqh)/2)]">{proof}</div>
              <div className="pointer-events-none absolute inset-y-0 right-[env(safe-area-inset-right)] grid w-[calc((100cqw-56.25cqh)/2)] place-items-center px-5">
                <p className="flex max-w-[230px] flex-col items-center gap-2 text-center text-[13px] leading-snug text-room-subtle">
                  <RotateCcwSquare className="size-6" strokeWidth={1.75} />
                  Para uma melhor experiência, vire o telemóvel ao alto.
                </p>
                <span className="pointer-events-auto absolute bottom-3 right-3">
                  <LiveHeartButton onHeart={sendHeart} reactions={reactions} panel />
                </span>
              </div>
            </>
          ) : null}
          {/* Com o teclado aberto, o título sai: ficam o vídeo, as últimas mensagens e a caixa de escrever.
              O título e quem apresenta podem desligar-se no editor: fica o vídeo e, logo a seguir, o chat. */}
          {live.header !== false ? (
          <div className="md:portrait:hidden max-lg:landscape:hidden lg:hidden group-[.live-room-shell--keyboard]/room:hidden">
            <RoomTitle
              compact
              kicker=""
              title={webinar.public_title}
              host={{ name: webinar.host_name ?? "", role: webinar.host_role ?? "", avatarUrl: webinar.host_avatar_url ?? "", verified: hostVerified }}
              follow={follow ? <FollowButton label={follow.label} onClick={follow.onClick} /> : null}
              onHost={openFollow}
              foldable
            />
          </div>
          ) : null}
          <div className={cn("hidden px-1", live.header !== false && "md:portrait:block lg:block")}>
            <RoomTitle
              kicker={
                waiting ? "Sessão agendada" : finished ? "Sessão terminada" : mode === "live" ? "Sessão ao vivo" : "Sessão em replay"
              }
              title={webinar.public_title}
              host={{ name: webinar.host_name ?? "", role: webinar.host_role ?? "", avatarUrl: webinar.host_avatar_url ?? "", verified: hostVerified }}
              follow={follow ? <FollowButton big label={follow.label} onClick={follow.onClick} /> : null}
              onHost={openFollow}
            />
            {webinar.description ? (
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-room-subtle">{webinar.description}</p>
            ) : null}
          </div>
        </section>
        <aside
          className={cn(
            // Deitado, 300 px (mais a zona segura): o vídeo 16:9 enche a altura no iPhone com as barras do Safari (852×283).
            "relative flex min-h-0 flex-1 flex-col overflow-hidden md:portrait:rounded-2xl max-lg:landscape:w-[calc(min(300px,40vw)+env(safe-area-inset-right))] max-lg:landscape:flex-none max-lg:landscape:border-l max-lg:landscape:border-room-line/60 phone-land:bg-room-bg phone-land:pr-[env(safe-area-inset-right)] lg:sticky lg:top-6 lg:h-[calc(100dvh-3rem)] lg:rounded-2xl",
            // Com o teclado aberto, nunca menos do que a caixa de escrever (69 px: borda + 12 + 44 + 12), para ela não sair do ecrã.
            "group-[.live-room-shell--keyboard]/room:portrait:min-h-[69px]",
            !chatOpen && "max-lg:landscape:hidden lg:hidden",
            turnUp && "hidden",
          )}
        >
          {panel}
          {/* As redes abrem por cima do painel, como no Live. */}
          {followSheet}
        </aside>
      </div>
      {groupDialog}
    </main>
  );
}
