import { friendlyError } from "@/lib/friendly-error";
import { IMAGE_PRESETS, imageExtension, shrinkImage } from "@/lib/shrink-image";
import { deleteWebinar } from "@/lib/webinar-delete.functions";
import { createFileRoute, Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CalendarDays,
  ClipboardCheck,
  Eye,
  Flag,
  Gift,
  Loader2,
  LogIn,
  Menu,
  MessagesSquare,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingBag,
  Users,
  Video,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { AppShell, useShellMenu } from "@/components/app-shell";
import { PageSkeleton } from "@/components/page-skeleton";
import { AiCommentsDialog } from "@/components/ai-comments-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  AI_JOB_STAGES,
  defaultAiSettings,
  markAiJobSeen,
  startAiJob,
  useAiJob,
  type AiSettings,
  type DraftComment,
  type TranscriptSegment,
} from "@/lib/ai-comment-jobs";
import { getWebinarAnalysis, getWebinarTranscript, saveWebinarTranscript } from "@/lib/ai-comments.functions";
import { getAgent } from "@/lib/ai-agent/agent.functions";
import { activationBlockers, channelStatus, readSteps } from "@/lib/workflow";
import { reviewIssues, reviewSummary, type ReviewFix, type ReviewIssue } from "@/lib/webinar-review";
import { curveBounds } from "@/lib/audience-curve";
import {
  applyChatRealism,
  chatPace,
  DEFAULT_CHAT_RULES,
  hostQuestions,
  namePool,
  parseChatRules,
  parseCommentSheet,
  type ChatDraft,
  type ChatRules,
} from "@/lib/chat-realism";
import { chatVariant } from "@/lib/chat-variants";
import {
  providerLabels,
  publicOrigin,
  slugify,
  statusFromLifecycle,
  useAudienceConfiguration,
  useInvalidate,
  useScheduledComments,
  useVideoSources,
  useWebinar,
  useWebinarAutomations,
  useWorkspace,
  type WebinarStatus,
} from "@/lib/data";
import { entryFieldsProblem, entryNotice, parseEntryFields, type EntryField } from "@/lib/entry-fields";
import {
  audienceModeFor,
  buildFormatCurve,
  clock,
  curveValueAt,
  inferAudienceFormat,
  offerDeadlinePassed,
  parseExtraOffers,
  liveSettings,
  roomCountdown,
  roomFormat,
  type AudienceContext,
  type AudienceFormat,
  type LiveSettings,
  type OfferSlot,
} from "@/lib/room-logic";
import { formatSessionStart, lifecycleLabel, sessionWindow, webinarLifecycle } from "@/lib/schedule";
import { toStorageOffsets } from "@/lib/temporal/placement";
import { cn, offerUrl } from "@/lib/utils";
import { writeRoomDraft } from "@/lib/room-draft";
import {
  MAX_VIDEO_BYTES,
  VIDEO_BUCKET,
  createVideoUpload,
  formatBytes,
  safeObjectName,
  type VideoUploadHandle,
  type VideoUploadProgress,
} from "@/lib/video-upload";
import {
  EDITOR_STEPS,
  editorLoading,
  isoFromLocalInput,
  localInputFromIso,
  offerTiming,
  reviewToAnnounce,
  statusOnSave,
  stepFromSearch,
  webinarIssues,
  type EditorStep,
} from "@/lib/webinar-draft";
import { useSimulatedPurchases, useSocialProof } from "@/components/social-proof-editor";
import { EntryScreen, entryLiveLabel, resolveTheme } from "@/components/room/entry-screen";
import { WaitingScreen } from "@/components/room/waiting-screen";
import { useVideoShape } from "@/components/video-player";
import type { Appearance, Reaction } from "@/components/room/room-parts";
import { emptyEditorForm, type EditorForm, type FocusProps } from "@/components/webinar-editor/form";
import { HelpButton } from "@/components/webinar-editor/ui";
import type { HelpTopic } from "@/components/webinar-editor/help";
import {
  DeviceStage,
  DeviceToggle,
  ExpandButton,
  ZoomControl,
  FullScreen,
  PhaseBar,
  PHASE_NAME,
  phaseOf,
  PlayChip,
  RotateButton,
  ScreenTabs,
  SCREENS as SCREEN_SIZES,
  WhatsAppPreview,
  type Device,
  type Phase,
  type ScreenTab,
} from "@/components/webinar-editor/preview";
import { playPreviewWithSound, RoomPreview, type PreviewMine, type RoomTab } from "@/components/webinar-editor/room-preview";
import { PublishPage } from "@/components/webinar-editor/publish-page";
import { StepInicio } from "@/components/webinar-editor/steps/inicio";
import { StepEntrada } from "@/components/webinar-editor/steps/entrada";
import { StepVideo, type EditorClock } from "@/components/webinar-editor/steps/video";
import { StepChat, type ChatWay } from "@/components/webinar-editor/steps/chat";
import { StepAudiencia } from "@/components/webinar-editor/steps/audiencia";
import { StepOferta } from "@/components/webinar-editor/steps/oferta";
import { demoSales, StepVendas } from "@/components/webinar-editor/steps/vendas";
import { StepAutomacoes } from "@/components/webinar-editor/steps/automacoes";
import { StepAgente } from "@/components/webinar-editor/steps/agente";
import { StepAgenda, type ScheduleKind } from "@/components/webinar-editor/steps/agenda";
import { StepRevisao } from "@/components/webinar-editor/steps/revisao";
import type { Database } from "@/integrations/supabase/types";

type Provider = Database["public"]["Enums"]["video_provider"];

export const Route = createFileRoute("/webinars/$webinarId/edit")({
  // A sessão do organizador só existe no browser: sem isto o pedido corre no
  // servidor sem autorização e a página fica em branco.
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { step?: string | undefined } =>
    typeof search["step"] === "string" ? { step: search["step"] } : {},
  head: () => ({
    meta: [
      { title: "Editar webinar | Novawebinar" },
      { name: "description", content: "Edite a página, o vídeo, o chat, a oferta e a agenda do webinar." },
      { property: "og:title", content: "Editar webinar | Novawebinar" },
      { property: "og:description", content: "Configuração completa do webinar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EditWebinar,
});

/** Ícone, título e ajuda de cada etapa. A ordem e os grupos vêm do rascunho. */
const STEP_UI: Record<EditorStep, { icon: LucideIcon; title: string; help?: HelpTopic }> = {
  inicio: { icon: Flag, title: "Webinar e quem apresenta", help: "inicio" },
  entrada: { icon: LogIn, title: "Página de entrada", help: "entrada" },
  video: { icon: Video, title: "Vídeo", help: "video" },
  chat: { icon: MessagesSquare, title: "Comentários simulados", help: "chat" },
  audiencia: { icon: Users, title: "Audiência", help: "audiencia" },
  oferta: { icon: Gift, title: "Oferta", help: "oferta" },
  vendas: { icon: ShoppingBag, title: "Vendas", help: "vendas" },
  automacoes: { icon: Zap, title: "Automações", help: "automacoes" },
  agente: { icon: Bot, title: "Agente IA", help: "agente" },
  agenda: { icon: CalendarDays, title: "Agenda", help: "agenda" },
  // A própria Revisão é o guia: sem (i).
  revisao: { icon: ClipboardCheck, title: "Revisão" },
};
const STEPS = EDITOR_STEPS.map((s) => ({ ...s, ...STEP_UI[s.id] }));
const GROUP_NAME = { antes: "Antes da sala", sala: "Na sala", depois: "Depois da sala", lancar: "Lançar" } as const;

const NOOP = () => {};

/** Etapas que seguem o tempo do vídeo: sem vídeo, pedem-no primeiro. */
const NEEDS_VIDEO: readonly EditorStep[] = ["chat", "audiencia", "oferta", "vendas"];
/** Os ecrãs da sala, e a etapa que cada um abre. */
const SCREENS: [EditorStep, string][] = [
  ["video", "Vídeo"],
  ["audiencia", "Audiência"],
  ["vendas", "Vendas"],
  ["chat", "Chat"],
  ["agente", "Suporte"],
];

/** As regras do chat no pedido ao gerador: o português de cada país e o volume da audiência. */
function generatorSettings(rules: ChatRules, audience: number): AiSettings {
  const pace = chatPace(audience, rules.volume, rules.perMinute);
  return {
    ...defaultAiSettings,
    variant: chatVariant(rules.countries, rules.launch),
    level: pace.perMinute <= 5 ? "low" : pace.perMinute >= 15 ? "high" : "medium",
    frequency: Math.max(1, Math.round(60 / pace.perMinute)),
    participants: pace.people,
    // Os emojis são escolha de quem apresenta, em qualquer tom.
    emojis: rules.emoji ? "high" : "low",
    tone: rules.tone === "vendas" ? "excited" : rules.tone === "formal" ? "professional" : "natural",
  };
}

function EditWebinar() {
  const { webinarId } = Route.useParams();
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data: workspace, isPending: workspacePending } = useWorkspace();
  const organizationId = workspace?.organizationId ?? null;
  const { data: webinar, isPending: webinarPending } = useWebinar(webinarId);
  const { data: videoSources = [], isPending: videosPending } = useVideoSources(workspace?.organizationId);
  const { data: comments = [], isPending: commentsPending } = useScheduledComments(webinarId);
  const { data: audience } = useAudienceConfiguration(webinarId);
  const { data: simulatedPurchases = [] } = useSimulatedPurchases(webinarId);
  const { data: socialProof } = useSocialProof(webinarId);
  const { data: automations } = useWebinarAutomations(webinarId);

  const initialStep = Route.useSearch().step;
  const [step, setStepState] = useState<EditorStep>(() => stepFromSearch(initialStep));
  const [form, setForm] = useState<EditorForm>(emptyEditorForm);
  const set = useCallback((patch: Partial<EditorForm>) => setForm((prev) => ({ ...prev, ...patch })), []);

  /* ---------- Estado gravado ---------- */

  const [saving, setSaving] = useState(false);
  // O formulário como está gravado: o que difere dele são alterações por gravar.
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [product, setProduct] = useState("");
  const [savedProduct, setSavedProduct] = useState("");
  const [format, setFormat] = useState<AudienceFormat>("dynamic");
  const [range, setRange] = useState({ min: 200, max: 600 });
  const [savedAudience, setSavedAudience] = useState<string | null>(null);
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>("single");
  // Os campos da página, a oferta seguinte e as regras do chat: listas e objectos à parte.
  const [entryFields, setEntryFields] = useState<EntryField[]>(() => parseEntryFields([], { collectPhone: true, requirePhone: false }));
  const [extraOffers, setExtraOffers] = useState<OfferSlot[]>([]);
  const [chatRules, setChatRules] = useState<ChatRules>(DEFAULT_CHAT_RULES);
  const [savedExtras, setSavedExtras] = useState<string | null>(null);
  const extrasKey = (fields: EntryField[], extras: OfferSlot[], rules: ChatRules) =>
    JSON.stringify({ fields, extras, rules });

  // Carrega o formulário uma única vez por webinar: assim uma atualização em
  // segundo plano não apaga o que o organizador está a escrever.
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!webinar || hydratedRef.current === webinar.id) return;
    hydratedRef.current = webinar.id;
    const base = emptyEditorForm();
    const loaded: EditorForm = {
      ...base,
      internal_name: webinar.internal_name,
      public_title: webinar.public_title,
      description: webinar.description,
      host_name: webinar.host_name ?? "",
      host_role: webinar.host_role ?? "",
      host_avatar_url: webinar.host_avatar_url ?? "",
      chat_pin_title: webinar.chat_pin_title ?? base.chat_pin_title,
      chat_pin_message: webinar.chat_pin_message ?? "",
      offer_pin_title: webinar.offer_pin_title ?? base.offer_pin_title,
      offer_pin_message: webinar.offer_pin_message ?? "",
      slug: webinar.slug,
      scheduled_at: localInputFromIso(webinar.scheduled_at, webinar.timezone ?? "Europe/Lisbon"),
      session_end_time: webinar.session_end_time ?? "",
      status: webinar.status,
      video_source_id: webinar.video_source_id ?? "none",
      replay_enabled: webinar.replay_enabled,
      waiting_room_enabled: webinar.waiting_room_enabled,
      schedule_mode: webinar.schedule_mode === "jit" ? "jit" : "single",
      recurrence_enabled: webinar.recurrence_enabled ?? false,
      recurrence_pattern: webinar.recurrence_pattern === "weekly" ? "weekly" : "daily",
      recurrence_weekday: String(webinar.recurrence_weekday ?? 1),
      recurrence_start_time: webinar.recurrence_start_time ?? "",
      recurrence_end_time: webinar.recurrence_end_time ?? "",
      jit_interval_minutes: String(webinar.jit_interval_minutes ?? 15),
      timezone: webinar.timezone ?? "Europe/Lisbon",
      sync_video_with_start: webinar.sync_video_with_start ?? false,
      cta_text: webinar.cta_text ?? "",
      cta_url: webinar.cta_url ?? "",
      cta_price_original: webinar.cta_price_original ?? "",
      cta_price_now: webinar.cta_price_now ?? "",
      cta_image_url: webinar.cta_image_url ?? "",
      cta_countdown_seconds: String(webinar.cta_countdown_seconds ?? 300),
      cta_start_seconds: String(webinar.cta_start_seconds ?? webinar.pitch_seconds ?? ""),
      cta_end_seconds: webinar.cta_end_seconds != null ? String(webinar.cta_end_seconds) : "",
      registration_button_text: webinar.registration_button_text,
      registration_collect_phone: webinar.registration_collect_phone,
      registration_require_phone: webinar.registration_require_phone,
      registration_progress_enabled: webinar.registration_progress_enabled ?? false,
      registration_progress_value: String(webinar.registration_progress_value ?? 92),
      registration_badge_text: webinar.registration_badge_text ?? "",
      room_theme: webinar.room_theme === "light" ? "light" : "dark",
      share_title: webinar.share_title ?? "",
      share_description: webinar.share_description ?? "",
      share_image_url: webinar.share_image_url ?? "",
      webhook_url: webinar.webhook_url ?? "",
      webhook_enabled: webinar.webhook_enabled ?? false,
      host_verified: webinar.host_verified,
      room_theme_system: webinar.room_theme_system,
      room_format: roomFormat(webinar.chat_settings),
      entry_mode: (webinar.chat_settings as { entry_mode?: unknown } | null)?.entry_mode === "own" ? "own" : "page",
      // Num webinar antigo, a contagem vem das colunas prelive_*: o editor mostra o que a sala faz.
      live: liveSettings(webinar.chat_settings, webinar),
      entry_card_color: webinar.entry_card_color,
      entry_button_color: webinar.entry_button_color,
      offer_utm: webinar.offer_utm,
      offer_countdown_end: webinar.offer_countdown_end === "close" ? "close" : "keep",
      offer_deadline: webinar.offer_deadline ?? "",
      sales_show_real: webinar.sales_show_real,
      sales_where: webinar.sales_where === "chat" || webinar.sales_where === "video" ? webinar.sales_where : "both",
      recurrence_days: webinar.recurrence_days ?? [],
      recurrence_times: webinar.recurrence_times?.length
        ? webinar.recurrence_times
        : webinar.recurrence_start_time
          ? [webinar.recurrence_start_time]
          : [],
      jit_skip_night: webinar.jit_skip_night,
    };
    setForm(loaded);
    setSavedSnapshot(JSON.stringify(loaded));
    const fields = parseEntryFields(webinar.entry_fields, {
      collectPhone: webinar.registration_collect_phone,
      requirePhone: webinar.registration_require_phone,
    });
    const extras = parseExtraOffers(webinar.extra_offers);
    const rules = parseChatRules(webinar.chat_settings);
    setEntryFields(fields);
    setExtraOffers(extras);
    setChatRules(rules);
    setSavedExtras(extrasKey(fields, extras, rules));
    setScheduleKind(
      loaded.schedule_mode === "jit"
        ? "jit"
        : loaded.recurrence_enabled
          ? "repeat"
          : loaded.scheduled_at || loaded.status === "draft"
            ? "single"
            : "ondemand",
    );
  }, [webinar]);

  // A etapa só se desenha com o que mostra já lido (o vídeo, a duração e os comentários), nunca vazia a carregar.
  const loading = editorLoading({
    webinar: webinarPending,
    // O formulário recebe o webinar num efeito: até lá, os campos estão vazios.
    hydrated: !webinar || hydratedRef.current === webinar.id,
    workspace: workspacePending,
    organization: Boolean(organizationId),
    videos: videosPending,
    comments: commentsPending,
  });

  const productLoadedRef = useRef(false);
  useEffect(() => {
    if (socialProof === undefined || productLoadedRef.current) return;
    productLoadedRef.current = true;
    setProduct(socialProof?.product_name ?? "");
    setSavedProduct(socialProof?.product_name ?? "");
  }, [socialProof]);

  /* ---------- Vídeo, transcrição e análise ---------- */

  const selectedVideo = videoSources.find((v) => v.id === form.video_source_id) ?? null;
  const duration = selectedVideo?.duration_seconds || webinar?.duration_seconds || 0;
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const { data: savedTranscript } = useQuery({
    queryKey: ["webinar-transcript", webinarId],
    queryFn: async () => (await getWebinarTranscript({ data: { webinarId } })).transcript,
  });
  useEffect(() => {
    if (savedTranscript?.length) setTranscript((current) => (current.length ? current : savedTranscript));
  }, [savedTranscript]);
  const keepTranscript = (segments: TranscriptSegment[]) => {
    setTranscript(segments);
    void saveWebinarTranscript({ data: { webinarId, transcript: segments } }).catch(() => {});
  };
  const speech = useMemo(() => [...transcript].sort((a, b) => a.at - b.at), [transcript]);
  const speechAt = useCallback(
    (seconds: number) => {
      let found: string | null = null;
      for (const s of speech) {
        if (s.at > seconds) break;
        found = s.text;
      }
      return found;
    },
    [speech],
  );
  const questions = useMemo(() => hostQuestions(speech), [speech]);

  const aiJob = useAiJob(webinarId);
  // O agente, para a Revisão: a mesma leitura (e a mesma cache) do passo Agente.
  const { data: agentBundle } = useQuery({
    queryKey: ["ai-agent", webinarId],
    queryFn: () => getAgent({ data: { webinarId } }),
    enabled: step === "revisao",
  });
  const { data: savedAnalysis, isPending: analysisPending } = useQuery({
    queryKey: ["webinar-analysis", webinarId],
    queryFn: async () => (await getWebinarAnalysis({ data: { webinarId } })).analysis,
  });
  const analysis = aiJob?.analysis ?? savedAnalysis ?? null;
  // Os momentos da análise: risco de perder audiência, interesse e o minuto sugerido para o pitch.
  const moments = useMemo(
    () =>
      (analysis?.segments ?? []).map((segment) => {
        const risk = String(segment.dropRisk);
        return {
          from: segment.from,
          to: segment.to,
          kind: segment.kind,
          risk: (/alt|high/i.test(risk) ? "alto" : /mod|med/i.test(risk) ? "moderado" : "baixo") as "alto" | "moderado" | "baixo",
          engagement: segment.engagement,
        };
      }),
    [analysis],
  );
  const suggestedPitch = useMemo(() => {
    const transition = moments.find((m) => /oferta|pitch|cta/i.test(m.kind));
    return transition ? Math.round(transition.from) : null;
  }, [moments]);
  const engagementAt = useMemo(
    () =>
      moments.length
        ? (seconds: number) => moments.find((m) => seconds >= m.from && seconds < m.to)?.engagement ?? null
        : undefined,
    [moments],
  );

  /* ---------- Relógio do editor: o vídeo dá o tempo à sala ---------- */

  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setT((prev) => {
        const next = prev + dt;
        if (duration > 0 && next >= duration) {
          setPlaying(false);
          return duration;
        }
        return next;
      });
    }, 220);
    return () => window.clearInterval(timer);
  }, [playing, duration]);
  const seek = useCallback((seconds: number) => setT(Math.max(0, Math.min(duration || seconds, seconds))), [duration]);
  const editorClock: EditorClock = {
    t,
    duration: Math.max(1, duration),
    playing,
    toggle: () => togglePlay(),
    seek,
  };
  /** Leva o vídeo uns segundos antes e toca, para ver acontecer na sala. */
  const watchAt = (seconds: number, tab: RoomTab | null = null) => {
    setRoomTab(tab);
    seek(Math.max(0, seconds - 3));
    if (!playing) togglePlay();
  };

  /* ---------- Pré-visualização ---------- */

  const [device, setDevice] = useState<Device>("desktop");
  // No computador a pré-visualização fica à direita; num ecrã estreito fica por cima do painel e
  // esconde-se pela pega. Só uma das duas é desenhada (o vídeo não toca a dobrar).
  const [wide, setWide] = useState(true);
  const [phoneScreen, setPhoneScreen] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setWide(media.matches);
    update();
    if (!media.matches) setDevice("phone");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [landscape, setLandscape] = useState(false);
  const [full, setFull] = useState(false);
  // O painel de configuração minimiza-se: no computador fica uma tira à esquerda, num ecrã estreito fica o título.
  const [panelOpen, setPanelOpen] = useState(true);
  const [roomTab, setRoomTab] = useState<RoomTab | null>(null);
  const [entryView, setEntryView] = useState<"page" | "room">("page");
  // A fase escolhida na barra da pré-visualização (Inscrição, Espera, Ao vivo, Fim); null = o ecrã da etapa.
  const [phase, setPhase] = useState<Phase | null>(null);
  // A Revisão chegou ao fim: o Publicar do rodapé acorda.
  const [reviewDone, setReviewDone] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [mine, setMine] = useState<PreviewMine[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  // Sem som até ao primeiro play; aí liga-se, a não ser que a pessoa o tenha tirado no ⚙.
  const [volume, setVolume] = useState(0);
  const soundChosen = useRef(false);
  const [zoom, setZoom] = useState<number | null>(null);
  // O tamanho com que o aparelho cabe inteiro: o valor do zoom quando não há zoom.
  const [fit, setFit] = useState<number | null>(null);
  /** Tocar ou pausar. O som liga-se no próprio toque, porque o iPhone não deixa ligá-lo depois. */
  function togglePlay() {
    if (!playing) {
      const next = soundChosen.current ? volume : volume || 1;
      if (next !== volume) setVolume(next);
      playPreviewWithSound(next);
    }
    setPlaying((p) => !p);
  }
  const [captionsOn, setCaptionsOn] = useState(false);
  const [published, setPublished] = useState(false);
  const [agentState, setAgentState] = useState({ on: false, name: "Equipa" });
  // A aparência da sala: a escolhida pelo organizador; na pré-visualização pode trocar-se no ⚙.
  const orgAppearance: Appearance = form.room_theme_system ? "system" : form.room_theme;
  const [previewAppearance, setPreviewAppearance] = useState<Appearance>(orgAppearance);
  useEffect(() => setPreviewAppearance(orgAppearance), [orgAppearance]);
  const [prefersDark, setPrefersDark] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setPrefersDark(media.matches);
    const onChange = (event: MediaQueryListEvent) => setPrefersDark(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const previewTheme = resolveTheme(previewAppearance, prefersDark);

  const focus: FocusProps = (key) => ({
    onFocus: () => setFocusKey(key),
    onBlur: () => setFocusKey((k) => (k === key ? null : k)),
  });
  const heart = () => {
    const now = Date.now();
    const add = Array.from({ length: 3 }, (_, i) => ({
      id: `${now}-${i}`,
      offset: Math.round((Math.random() - 0.5) * 60),
      size: 20 + Math.round(Math.random() * 8),
    }));
    add.forEach((r, i) => window.setTimeout(() => setReactions((list) => [...list.slice(-20), r]), i * 110));
    window.setTimeout(() => setReactions((list) => list.filter((r) => !add.some((a) => a.id === r.id))), 3200);
  };

  const setStep = (next: EditorStep) => {
    setStepState(next);
    setPhase(null);
    if (next === "revisao") setReviewDone(false);
    setPublished(false);
    setPlaying(false);
    setRoomTab(null);
    setFocusKey(null);
    // Cada etapa leva o vídeo ao momento que lhe interessa.
    const start = form.cta_start_seconds.trim() === "" ? null : Number(form.cta_start_seconds);
    if (next === "oferta") seek((start ?? suggestedPitch ?? t) + 3);
    if (next === "vendas" && simulatedPurchases[0]) seek(simulatedPurchases[0].offset_seconds + 1);
    if (next === "audiencia") seek(moments.find((m) => m.risk === "alto" && m.from > 30)?.from ?? t);
  };

  /* ---------- Audiência ---------- */

  const pitchSeconds = form.cta_start_seconds.trim() === "" ? null : Number(form.cta_start_seconds) || 0;
  const audienceCtx: AudienceContext = useMemo(
    () => ({ durationSeconds: duration, pitchSeconds: pitchSeconds ?? suggestedPitch, engagementAt }),
    [duration, pitchSeconds, suggestedPitch, engagementAt],
  );
  // O que está gravado: o formato, o intervalo e, em «Cresce até à oferta», o minuto que dá a forma.
  const audienceKey = (f: AudienceFormat, r: { min: number; max: number }) =>
    JSON.stringify({ f, ...r, pitch: f === "cresce" ? (pitchSeconds ?? suggestedPitch) : null });
  const audienceLoadedRef = useRef(false);
  useEffect(() => {
    // Espera pela análise: o formato «Acompanha a fala» só se reconhece com ela.
    if (audience === undefined || audienceLoadedRef.current || !webinar || analysisPending) return;
    audienceLoadedRef.current = true;
    const bounds = curveBounds(audience?.curve);
    const nextRange = bounds && bounds.max > 0 ? { min: bounds.min, max: bounds.max } : { min: 200, max: 600 };
    const stored = audience?.format as AudienceFormat | null | undefined;
    const nextFormat = stored ?? (audience ? inferAudienceFormat(audience.mode, audience.curve, audienceCtx) : "dynamic");
    setRange(nextRange);
    setFormat(nextFormat);
    setSavedAudience(audience ? audienceKey(nextFormat, nextRange) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, webinar, audienceCtx, analysisPending]);
  const simulatedAudience = format !== "real" && format !== "off";
  /** O chat escreve para esta audiência: a média entre o mínimo e o máximo (sem número, 100). */
  const chatAudience = simulatedAudience ? Math.round((range.min + range.max) / 2) : 100;
  const curve = useMemo(
    () =>
      simulatedAudience
        ? buildFormatCurve(format === "mista" ? "dynamic" : format, range.min, range.max, audienceCtx)
        : [],
    [simulatedAudience, format, range.min, range.max, audienceCtx],
  );

  const saveAudience = async (): Promise<boolean> => {
    if (!organizationId) return false;
    if (savedAudience === audienceKey(format, range)) return true;
    const { error } = await supabase.from("audience_configuration").upsert(
      {
        webinar_id: webinarId,
        organization_id: organizationId,
        mode: audienceModeFor(format),
        format,
        curve,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "webinar_id" },
    );
    if (error) {
      toast.error(friendlyError(error));
      return false;
    }
    setSavedAudience(audienceKey(format, range));
    invalidate(["audience-configuration"]);
    return true;
  };

  const dirty =
    (savedSnapshot !== null && JSON.stringify(form) !== savedSnapshot) ||
    product !== savedProduct ||
    (savedAudience !== null && audienceKey(format, range) !== savedAudience) ||
    (savedExtras !== null && extrasKey(entryFields, extraOffers, chatRules) !== savedExtras);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      dirtyRef.current &&
      current.pathname !== next.pathname &&
      !window.confirm("Há alterações por gravar. Sair mesmo assim?"),
    enableBeforeUnload: () => dirtyRef.current,
  });

  /* ---------- Produto e compras de demonstração ---------- */

  const saveProduct = async (changes: { enabled?: boolean; notification_color?: string } = {}): Promise<boolean> => {
    if (!organizationId) return false;
    if (product === savedProduct && changes.enabled === undefined && changes.notification_color === undefined) return true;
    const { error } = await supabase.from("social_proof_settings").upsert(
      {
        webinar_id: webinarId,
        organization_id: organizationId,
        product_name: product.trim(),
        ...changes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "webinar_id" },
    );
    if (error) {
      toast.error(friendlyError(error));
      return false;
    }
    setSavedProduct(product);
    invalidate(["social-proof"]);
    return true;
  };

  const [salesBusy, setSalesBusy] = useState(false);
  const salesEnabled = Boolean(socialProof?.enabled);
  const salesCount = simulatedPurchases.length || 6;
  // A cor do aviso de compra: muda logo na pré-visualização e grava-se ao escolher.
  const [saleColorPick, setSaleColorPick] = useState<string | null>(null);
  const saleColorNow = saleColorPick ?? socialProof?.notification_color ?? "emerald";
  const pickSaleColor = (color: string) => {
    setSaleColorPick(color);
    void saveProduct({ notification_color: color });
  };
  const regenerateSales = async (count: number) => {
    if (!organizationId) return;
    const name = product.trim() || "a vaga";
    const { error: deleteError } = await supabase.from("simulated_purchase_events").delete().eq("webinar_id", webinarId);
    if (deleteError) throw deleteError;
    const rows = demoSales(count, pitchSeconds, duration, chatRules.countries).map((s) => ({
      webinar_id: webinarId,
      organization_id: organizationId,
      buyer_name: s.buyer,
      product_name: name,
      message: "",
      offset_seconds: s.at,
    }));
    const { error } = await supabase.from("simulated_purchase_events").insert(rows);
    if (error) throw error;
    invalidate(["simulated-purchases"]);
  };
  // A quantidade grava-se quando se pára de carregar no + e no −.
  const [countDraft, setCountDraft] = useState<number | null>(null);
  useEffect(() => {
    if (countDraft === null) return;
    const timer = window.setTimeout(() => void setSales(true, countDraft).then(() => setCountDraft(null)), 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countDraft]);
  const setSales = async (enabled: boolean, count: number) => {
    setSalesBusy(true);
    try {
      if (enabled && (simulatedPurchases.length === 0 || count !== simulatedPurchases.length)) await regenerateSales(count);
      if (enabled !== salesEnabled) await saveProduct({ enabled });
      if (enabled) {
        const first = demoSales(count, pitchSeconds, duration)[0];
        if (first) watchAt(first.at);
      }
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível mudar as compras de demonstração."));
    } finally {
      setSalesBusy(false);
    }
  };

  /* ---------- Gravar ---------- */

  const lifecycle = webinarLifecycle(
    {
      schedule_mode: form.schedule_mode,
      scheduled_at: isoFromLocalInput(form.scheduled_at, form.timezone),
      session_end_time: form.session_end_time || null,
      recurrence_enabled: form.recurrence_enabled,
      recurrence_pattern: form.recurrence_pattern,
      recurrence_weekday: Number(form.recurrence_weekday) || 0,
      recurrence_start_time: form.recurrence_times[0] ?? form.recurrence_start_time,
      recurrence_end_time: form.recurrence_end_time,
      recurrence_days: form.recurrence_days,
      recurrence_times: form.recurrence_times,
      jit_interval_minutes: Number(form.jit_interval_minutes) || 15,
      jit_skip_night: form.jit_skip_night,
      timezone: form.timezone,
      duration_seconds: duration,
    },
    Date.now(),
  );
  const derivedStatus: WebinarStatus =
    lifecycle.kind === "on_demand" && form.status === "draft" ? "draft" : statusFromLifecycle(lifecycle, form.replay_enabled);

  const lastDateRef = useRef("");
  const chooseScheduleKind = (kind: ScheduleKind) => {
    if (form.scheduled_at) lastDateRef.current = form.scheduled_at;
    setScheduleKind(kind);
    if (kind === "jit") set({ schedule_mode: "jit", recurrence_enabled: false });
    if (kind === "repeat")
      set({
        schedule_mode: "single",
        recurrence_enabled: true,
        recurrence_times: form.recurrence_times.length
          ? form.recurrence_times
          : [form.recurrence_start_time || form.scheduled_at.split("T")[1] || "20:00"],
      });
    if (kind === "single")
      set({ schedule_mode: "single", recurrence_enabled: false, scheduled_at: form.scheduled_at || lastDateRef.current });
    // Sem data, cada pessoa vê desde o início quando entra.
    if (kind === "ondemand") set({ schedule_mode: "single", recurrence_enabled: false, scheduled_at: "" });
  };

  const draftIssues = webinarIssues(
    { ...form, recurrence_start_time: form.recurrence_times[0] ?? form.recurrence_start_time },
    { durationSeconds: duration },
  ).filter((issue) => !(scheduleKind === "ondemand" && issue.field === "scheduled_at"));
  const sessionEnded = (() => {
    if (scheduleKind !== "single" || lifecycle.kind !== "session" || lifecycle.state !== "finished") return null;
    return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", timeZone: form.timezone }).format(
      new Date(lifecycle.startMs),
    );
  })();
  const offerVisible = Boolean(form.cta_text.trim());
  const fieldsProblem = entryFieldsProblem(entryFields);
  const launchIssues: ReviewIssue[] = [
    ...(fieldsProblem ? [{ step: "entrada" as const, title: fieldsProblem, detail: "Impede gravar." }] : []),
    ...(!selectedVideo ? [{ step: "video" as const, title: "Falta o vídeo", detail: "O chat, a oferta e a audiência seguem o tempo dele." }] : []),
    ...draftIssues.map((issue) => ({ step: issue.step, title: issue.message, detail: issue.blocking ? "Impede gravar." : "" })),
    ...(offerVisible && !product.trim()
      ? [{ step: "oferta" as const, title: "Falta o nome do produto", detail: "Aparece na oferta e nas compras." }]
      : []),
    ...(offerVisible && pitchSeconds === null
      ? [
          {
            step: "oferta" as const,
            title: "Falta o minuto do pitch",
            detail: suggestedPitch !== null ? `A análise sugere ${clock(suggestedPitch)}.` : "Sem minuto, a oferta abre no início.",
            // A Revisão usa o minuto sugerido, como o «Pitch encontrado» da Oferta.
            ...(suggestedPitch !== null ? { fix: "pitch" as const } : {}),
          },
        ]
      : []),
    ...(automations && automations.workflows.length === 0
      ? [{ step: "automacoes" as const, title: "As automações não foram criadas", detail: "Ninguém recebe lembretes nem seguimento." }]
      : []),
    ...(sessionEnded ? [{ step: "agenda" as const, title: `A sessão de ${sessionEnded} já terminou`, detail: "Escolha uma nova data." }] : []),
    // «Sempre disponível» não abre sessão: as automações que dependem dela (lembretes, depois da aula) não arrancam.
    ...(scheduleKind === "ondemand" && automations?.workflows.length
      ? [
          {
            step: "agenda" as const,
            title: "Sem horário, os lembretes e o seguimento não arrancam",
            detail: "«Sempre disponível» não abre sessão. A mensagem de inscrição sai na mesma.",
          },
        ]
      : []),
  ];

  const save = async (options?: { silent?: boolean }): Promise<boolean> => {
    if (!webinar) return false;
    // Um erro que bloqueia não grava nada e leva ao passo do campo, também ao «Continuar».
    if (fieldsProblem) {
      toast.error(fieldsProblem);
      setStep("entrada");
      return false;
    }
    const blocking = draftIssues.find((issue) => issue.blocking);
    if (blocking) {
      toast.error(blocking.message);
      setStep(blocking.step);
      return false;
    }
    const offer = offerTiming(form);
    const whatsapp = entryFields.find((f) => f.kind === "whatsapp");
    const times = form.recurrence_times.filter(Boolean);
    setSaving(true);
    try {
      const { error } = await supabase
        .from("webinars")
        .update({
          internal_name: form.internal_name.trim(),
          public_title: form.public_title.trim(),
          description: form.description.trim(),
          host_name: form.host_name.trim(),
          host_role: form.host_role.trim(),
          host_avatar_url: form.host_avatar_url.trim(),
          host_verified: form.host_verified,
          chat_pin_title: form.chat_pin_title.trim(),
          slug: slugify(form.slug || form.public_title || form.internal_name),
          scheduled_at: scheduleKind === "ondemand" ? null : isoFromLocalInput(form.scheduled_at, form.timezone),
          status: statusOnSave(webinar, derivedStatus),
          video_source_id: form.video_source_id === "none" ? null : form.video_source_id,
          replay_enabled: form.replay_enabled,
          waiting_room_enabled: form.waiting_room_enabled,
          schedule_mode: form.schedule_mode,
          recurrence_enabled: form.recurrence_enabled,
          recurrence_pattern: form.recurrence_pattern,
          recurrence_weekday: Number(form.recurrence_weekday) || 0,
          // A primeira hora fica também na coluna antiga, que outras partes ainda lêem.
          recurrence_start_time: times[0] ?? form.recurrence_start_time,
          recurrence_days: form.recurrence_days,
          recurrence_times: times,
          jit_interval_minutes: Math.max(5, Number(form.jit_interval_minutes) || 15),
          jit_skip_night: form.jit_skip_night,
          timezone: form.timezone,
          sync_video_with_start: form.sync_video_with_start,
          room_theme: form.room_theme,
          room_theme_system: form.room_theme_system,
          cta_text: form.cta_text.trim() || null,
          cta_url: offerUrl(form.cta_url),
          cta_price_original: form.cta_price_original.trim(),
          cta_price_now: form.cta_price_now.trim(),
          cta_image_url: form.cta_image_url.trim(),
          cta_countdown_seconds: Math.max(0, Number(form.cta_countdown_seconds) || 0),
          // Um só minuto do pitch: a oferta aparece nele e os segmentos e as métricas comparam com ele.
          cta_start_seconds: offer.start,
          pitch_seconds: offer.start,
          cta_end_seconds: offer.end,
          offer_utm: form.offer_utm,
          offer_countdown_end: form.offer_countdown_end,
          offer_deadline: form.offer_deadline || null,
          extra_offers: extraOffers.map((o) => ({ ...o, url: offerUrl(o.url) ?? "" })) as unknown as Json,
          sales_show_real: form.sales_show_real,
          sales_where: form.sales_where,
          registration_button_text: form.registration_button_text.trim() || "Entrar na sala",
          // Os campos escolhidos; o WhatsApp fica também nas colunas antigas (formulários embed, métricas).
          entry_fields: entryFields as unknown as Json,
          registration_collect_phone: Boolean(whatsapp),
          registration_require_phone: Boolean(whatsapp?.required),
          registration_progress_enabled: form.registration_progress_enabled,
          registration_progress_value: Math.min(100, Math.max(0, Number(form.registration_progress_value) || 0)),
          registration_badge_text: form.registration_badge_text.trim().slice(0, 40),
          entry_card_color: form.entry_card_color,
          entry_button_color: form.entry_button_color,
          // As regras do chat e o formato da sala (ao lado ou por cima do vídeo) ficam juntos.
          chat_settings: {
            ...chatRules,
            room_format: form.room_format,
            entry_mode: form.entry_mode,
            live: { ...form.live, links: Object.fromEntries(Object.entries(form.live.links).map(([k, v]) => [k, (v ?? "").trim()]).filter(([, v]) => v)) },
          } as unknown as Json,
          share_title: form.share_title.trim(),
          share_description: form.share_description.trim(),
          share_image_url: form.share_image_url.trim() || null,
          webhook_url: form.webhook_url.trim(),
          webhook_enabled: form.webhook_enabled && Boolean(form.webhook_url.trim()),
          updated_at: new Date().toISOString(),
        })
        .eq("id", webinarId);
      if (error) throw error;
      const productOk = await saveProduct();
      const audienceOk = await saveAudience();
      invalidate(["webinar", "webinars"]);
      if (!options?.silent) {
        if (!productOk) toast.error("Webinar guardado, mas o nome do produto não foi guardado.");
        else if (!audienceOk) toast.error("Webinar guardado, mas a audiência não foi guardada.");
        else toast.success("Alterações guardadas.");
      }
      setSavedSnapshot(JSON.stringify(form));
      setSavedExtras(extrasKey(entryFields, extraOffers, chatRules));
      return productOk && audienceOk;
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível guardar."));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const nextStep = STEPS[stepIndex + 1];
  const prevStep = STEPS[stepIndex - 1];
  const saveAndGo = () => {
    void save({ silent: true }).then((ok) => {
      if (!ok) return;
      if (nextStep) setStep(nextStep.id);
      else setPublished(true);
    });
  };
  const publish = () => {
    void save({ silent: true }).then((ok) => ok && setPublished(true));
  };

  /* ---------- Imagens ---------- */

  const [uploadingImage, setUploadingImage] = useState(false);
  const uploadImage = async (file: File, field: "host_avatar_url" | "share_image_url" | "cta_image_url") => {
    setUploadingImage(true);
    try {
      // Reduzida no navegador ao tamanho em que aparece: a foto da sala passa de ~900 KB a ~6 KB.
      const preset = field === "host_avatar_url" ? IMAGE_PRESETS.avatar : field === "share_image_url" ? IMAGE_PRESETS.cover : IMAGE_PRESETS.offer;
      const small = await shrinkImage(file, preset);
      // «-160» marca a foto já reduzida: a sala serve-a como está (ver smallImage).
      const mark = small !== file && field === "host_avatar_url" ? "-160" : "";
      const path = `${webinarId}/${Date.now()}${mark}.${imageExtension(small)}`;
      const { error } = await supabase.storage
        .from("webinar-covers")
        .upload(path, small, { upsert: true, ...(small.type ? { contentType: small.type } : {}) });
      if (error) throw error;
      const { data, error: signError } = await supabase.storage
        .from("webinar-covers")
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (signError || !data) throw signError ?? new Error("Não foi possível preparar a imagem.");
      set({ [field]: data.signedUrl });
      toast.success("Imagem carregada. Guarde para aplicar.");
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível carregar a imagem."));
    } finally {
      setUploadingImage(false);
    }
  };

  /* ---------- Vídeo: biblioteca, envio e link ---------- */

  /** O vídeo escolhido grava logo: o resto das etapas (e a transcrição) dependem dele. */
  const persistVideo = async (id: string) => {
    set({ video_source_id: id });
    const { error } = await supabase.from("webinars").update({ video_source_id: id }).eq("id", webinarId);
    if (error) {
      toast.error(friendlyError(error, "O vídeo foi escolhido mas não ficou gravado. Carregue em Guardar."));
      return;
    }
    setSavedSnapshot((prev) => (prev ? JSON.stringify({ ...JSON.parse(prev), video_source_id: id }) : prev));
    invalidate(["webinar"]);
  };

  const readDurationFromSrc = (src: string, timeoutMs = 10000) =>
    new Promise<number>((resolve) => {
      const el = document.createElement("video");
      el.preload = "metadata";
      let done = false;
      const finish = (seconds: number) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        el.removeAttribute("src");
        el.load();
        resolve(seconds);
      };
      const timer = window.setTimeout(() => finish(0), timeoutMs);
      el.onloadedmetadata = () => finish(Number.isFinite(el.duration) && el.duration > 0 ? Math.round(el.duration) : 0);
      el.onerror = () => finish(0);
      el.src = src;
    });

  const addVideoLink = async (input: { name: string; provider: Provider; url: string }) => {
    if (!organizationId) return false;
    const detected = await readDurationFromSrc(input.url);
    const { data, error } = await supabase
      .from("video_sources")
      .insert({
        organization_id: organizationId,
        name: input.name,
        provider: input.provider,
        source_url: input.url,
        duration_seconds: detected,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(friendlyError(error));
      return false;
    }
    invalidate(["video-sources"]);
    await persistVideo(data.id);
    toast.success(detected ? "Vídeo escolhido e guardado." : "Vídeo escolhido. Não conseguimos ler a duração: confirme na Biblioteca.");
    return true;
  };

  const [videoUpload, setVideoUpload] = useState<{ file: File; progress: VideoUploadProgress } | null>(null);
  const videoUploadRef = useRef<VideoUploadHandle | null>(null);
  const uploading = videoUpload?.progress.status === "uploading" || videoUpload?.progress.status === "paused";

  const registerUploadedVideo = async (file: File, path: string, seconds: number) => {
    if (!organizationId) return;
    // O link assinado serve a pré-visualização e a transcrição; a sala pública assina a partir
    // de `storage_path` na altura da reprodução.
    const signed = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (signed.error || !signed.data?.signedUrl) {
      toast.error(friendlyError(signed.error ?? "Não foi possível preparar o link do vídeo."));
      return;
    }
    const { data, error } = await supabase
      .from("video_sources")
      .insert({
        organization_id: organizationId,
        name: file.name.replace(/\.[^.]+$/, ""),
        provider: "upload",
        source_url: signed.data.signedUrl,
        storage_path: path,
        duration_seconds: seconds,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    setVideoUpload(null);
    videoUploadRef.current = null;
    invalidate(["video-sources"]);
    await persistVideo(data.id);
    toast.success(`Vídeo enviado (${formatBytes(file.size)}), escolhido e guardado.`);
  };

  const uploadVideoFile = async (file: File) => {
    if (!organizationId) return;
    if (videoUploadRef.current && uploading) {
      toast.error("Já há um envio em curso. Espere que termine ou cancele-o primeiro.");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error(`O ficheiro tem ${formatBytes(file.size)} e ultrapassa o limite de 5 GB por vídeo.`);
      return;
    }
    if (file.size === 0) {
      toast.error("O ficheiro está vazio.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const seconds = await readDurationFromSrc(objectUrl).finally(() => URL.revokeObjectURL(objectUrl));
    const path = `${organizationId}/${crypto.randomUUID()}-${safeObjectName(file.name)}`;
    const handle = createVideoUpload({
      file,
      path,
      onProgress: (progress) => {
        setVideoUpload({ file, progress });
        if (progress.status === "error" && progress.error) toast.error(progress.error);
      },
      onSuccess: (finalPath) => void registerUploadedVideo(file, finalPath, seconds),
    });
    videoUploadRef.current = handle;
    setVideoUpload({
      file,
      progress: {
        status: "uploading",
        bytesSent: 0,
        bytesTotal: file.size,
        percent: 0,
        error: null,
        recoverable: false,
        resumedFromBytes: null,
      },
    });
    await handle.start();
  };

  /* ---------- Chat ---------- */

  const updateRules = (patch: Partial<ChatRules>) => setChatRules((prev) => ({ ...prev, ...patch }));
  const [chatWay, setChatWay] = useState<ChatWay>("ai");
  const [aiOpen, setAiOpen] = useState(false);

  // Quando a geração termina, abre a revisão no Chat uma só vez e já com o editor carregado. O resultado fica
  // guardado no browser: sem o «visto», cada abertura do editor (mesmo dias depois) saltava para o Chat.
  useEffect(() => {
    if (loading || !reviewToAnnounce(aiJob)) return;
    markAiJobSeen(webinarId);
    setStep("chat");
    setAiOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, aiJob?.status, aiJob?.seen, aiJob?.drafts?.length]);

  // O gerador lê o vídeo gravado na base: grava-se tudo antes de começar.
  const generate = async () => {
    if (!selectedVideo) {
      toast.error("Escolha o vídeo primeiro, na etapa Vídeo.");
      setStep("video");
      return;
    }
    if (chatRules.countries.length === 0) {
      toast.error("Escolha primeiro as nacionalidades de quem escreve, em «Pessoas do chat».");
      return;
    }
    const ok = await save({ silent: true });
    if (!ok) return;
    startAiJob({
      webinarId,
      webinarTitle: form.public_title || form.internal_name || "Webinar",
      settings: generatorSettings(chatRules, chatAudience),
      transcript,
      existing: comments.map((c) => ({ at: c.offset_seconds, author: c.author_name, message: c.message })),
      replaceAll: true,
      onTranscript: keepTranscript,
    });
  };

  const audienceNorm = useMemo(() => {
    if (!simulatedAudience || range.max <= range.min || curve.length < 2) return undefined;
    return (seconds: number) => (curveValueAt(curve, seconds, duration) - range.min) / (range.max - range.min);
  }, [simulatedAudience, range.min, range.max, curve, duration]);

  /** Grava os comentários com as regras para parecer real; os escritos à mão ficam. */
  const insertComments = async (drafts: (ChatDraft & Partial<DraftComment>)[], replaceGenerated: boolean) => {
    if (!organizationId) throw new Error("Não foi possível identificar o seu espaço de trabalho.");
    if (replaceGenerated) {
      const { error } = await supabase
        .from("scheduled_comments")
        .delete()
        .eq("webinar_id", webinarId)
        .neq("comment_type", "manual");
      if (error) throw error;
    }
    const valid = drafts
      .map((d) => ({ d, ...toStorageOffsets({ at: d.at, atMs: d.at * 1000 }) }))
      .filter(({ offset_seconds }) => duration <= 0 || offset_seconds <= duration);
    if (valid.length === 0) throw new Error("Nenhum comentário cabe dentro da duração do vídeo.");
    const { error } = await supabase.from("scheduled_comments").insert(
      valid.map(({ d, offset_seconds, offset_ms }) => ({
        webinar_id: webinarId,
        organization_id: organizationId,
        author_name: d.author,
        message: d.message,
        offset_seconds,
        offset_ms,
        comment_type: d.tag ?? d.moment ?? "geral",
        ai_intent: d.kind ?? null,
        ai_persona: d.persona ?? null,
        trigger_type: d.causality?.triggerType ?? null,
        trigger_id: d.causality?.triggerId ?? null,
        trigger_start_ms: d.causality?.triggerStartMs ?? null,
        trigger_end_ms: d.causality?.triggerEndMs ?? null,
        temporal_relation: d.causality?.temporalRelation ?? null,
        reaction_latency_ms: d.causality?.reactionLatencyMs ?? null,
        generation_reason: d.causality?.generationReason ?? d.reason ?? null,
        causality_confidence: d.causality?.confidence ?? null,
        validation_action: d.validationAction ?? null,
        validation_rule: d.validationRule ?? null,
        transcript_version_id: d.transcriptVersionId ?? null,
      })),
    );
    if (error) throw error;
    invalidate(["scheduled-comments"]);
    return valid.length;
  };

  const realism = (drafts: (ChatDraft & Partial<DraftComment>)[]) =>
    applyChatRealism(drafts, chatRules, {
      durationSeconds: duration,
      pitchSeconds: pitchSeconds ?? suggestedPitch,
      questions: questions.map((q) => q.at),
      audienceAt: audienceNorm,
      product,
    }) as (ChatDraft & Partial<DraftComment>)[];

  const insertGenerated = async (drafts: DraftComment[]) => {
    const ready = realism(drafts);
    const n = await insertComments(ready, true);
    const people = new Set(ready.map((d) => d.author)).size;
    toast.success(`${n} comentários de ${people} pessoas, no tom ${{ natural: "Natural", vendas: "Vendas", formal: "Formal" }[chatRules.tone]}.`);
  };

  const importSheet = async (file: File) => {
    try {
      const rows = parseCommentSheet(await file.text());
      if (rows.length === 0) {
        toast.error("A folha não tem linhas com minuto, nome e mensagem.");
        return;
      }
      const pool = namePool(chatRules.countries);
      const named = rows.map((r, i) => ({ ...r, author: r.author || pool[i % pool.length]! }));
      const n = await insertComments(named, false);
      toast.success(`${n} comentários importados.`);
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível importar a folha."));
    }
  };

  const writeComment = async (at: number, message: string) => {
    const recent = new Set(comments.filter((c) => Math.abs(c.offset_seconds - at) < 120).map((c) => c.author_name));
    const pool = namePool(chatRules.countries);
    const author = pool.find((name) => !recent.has(name)) ?? pool[comments.length % pool.length]!;
    try {
      await insertComments([{ at, author, message, tag: "manual" }], false);
      return true;
    } catch (error) {
      toast.error(friendlyError(error));
      return false;
    }
  };

  const editComment = async (id: string, patch: { at: number; author: string; message: string }) => {
    const { error } = await supabase
      .from("scheduled_comments")
      .update({ offset_seconds: Math.max(0, Math.round(patch.at)), author_name: patch.author, message: patch.message })
      .eq("id", id);
    if (error) {
      toast.error(friendlyError(error));
      return false;
    }
    invalidate(["scheduled-comments"]);
    return true;
  };

  const removeComment = async (id: string) => {
    const { error } = await supabase.from("scheduled_comments").delete().eq("id", id);
    if (error) toast.error(friendlyError(error));
    else invalidate(["scheduled-comments"]);
  };

  /* ---------- Formulário para página própria ---------- */

  const { data: forms = [], refetch: refetchForms } = useQuery({
    queryKey: ["registration-forms", webinarId],
    queryFn: async () => {
      const { data, error } = await supabase.from("registration_forms").select("id").eq("webinar_id", webinarId).limit(1);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [creatingForm, setCreatingForm] = useState(false);
  const createForm = async () => {
    if (!organizationId) return;
    setCreatingForm(true);
    const { error } = await supabase.from("registration_forms").insert({
      organization_id: organizationId,
      webinar_id: webinarId,
      name: "Formulário de inscrição",
      page_name: "Página de inscrição",
    });
    setCreatingForm(false);
    if (error) toast.error(friendlyError(error));
    else void refetchForms();
  };

  /* ---------- Eliminar ---------- */

  // No servidor, com a permissão confirmada; se parar a meio, diz o que ficou e repetir continua.
  const removeWebinar = async () => {
    const result = await deleteWebinar({ data: { webinarId } }).catch((error: unknown) => ({
      ok: false as const,
      error: friendlyError(error),
      remaining: [] as string[],
    }));
    if (!result.ok) {
      invalidate(["webinars"]);
      toast.error(result.remaining.length ? `${result.error} Ficou por apagar: ${result.remaining.join(", ")}. Tente outra vez.` : result.error);
      return;
    }
    invalidate(["webinars"]);
    toast.success("Webinar eliminado.");
    dirtyRef.current = false;
    await navigate({ to: "/webinars", search: { q: undefined } });
  };

  // Quando a oferta abre com o vídeo a tocar, a sala salta para o separador dela. No Webinar do telemóvel
  // ao alto o chat fica e a oferta sobe por cima dele, como na sala.
  const offerOpenNow = offerVisible && t >= (pitchSeconds ?? 0);
  const phoneWebinar = device === "phone" && !landscape && form.room_format !== "live";
  useEffect(() => {
    if (offerOpenNow && playing && !phoneWebinar) setRoomTab((current) => (current === "support" ? current : "offer"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offerOpenNow]);

  // A forma do vídeo (deitado ou ao alto) lê-se do ficheiro ou do Vimeo, como na sala; sem ela, a gravada.
  const shapeUrl = selectedVideo?.source_url && /^https?:\/\//i.test(selectedVideo.source_url) ? selectedVideo.source_url : null;
  const videoShape: LiveSettings["desk"] = useVideoShape(shapeUrl, selectedVideo?.provider) ?? form.live.desk;

  // Sala de teste (👁): o que se está a mudar chega logo à sala de teste aberta noutro separador, mesmo sem
  // guardar (neste browser; nada vai para a base). Só os campos que mudam a sala, arranjados como no guardar.
  useEffect(() => {
    if (!webinar || savedSnapshot === null) return;
    const timer = window.setTimeout(() => {
      const offer = offerTiming(form);
      const whatsapp = entryFields.find((f) => f.kind === "whatsapp");
      const url = selectedVideo?.source_url && /^https?:\/\//i.test(selectedVideo.source_url) ? selectedVideo.source_url : null;
      // O vídeo só quando foi trocado: o guardado chega à sala com o endereço assinado pelo servidor.
      const videoChanged = form.video_source_id !== (webinar.video_source_id ?? "none") && (url || !selectedVideo);
      writeRoomDraft(webinarId, {
        public_title: form.public_title.trim(),
        description: form.description.trim(),
        host_name: form.host_name.trim(),
        host_role: form.host_role.trim(),
        host_avatar_url: form.host_avatar_url.trim(),
        host_verified: form.host_verified,
        chat_pin_title: form.chat_pin_title.trim(),
        room_theme: form.room_theme,
        room_theme_system: form.room_theme_system,
        room_format: form.room_format,
        live: form.live,
        cta_text: form.cta_text.trim() || null,
        cta_url: offerUrl(form.cta_url),
        cta_price_original: form.cta_price_original.trim(),
        cta_price_now: form.cta_price_now.trim(),
        cta_image_url: form.cta_image_url.trim(),
        cta_countdown_seconds: Math.max(0, Number(form.cta_countdown_seconds) || 0),
        cta_start_seconds: offer.start,
        cta_end_seconds: offer.end,
        extra_offers: extraOffers.map((o) => ({ ...o, url: offerUrl(o.url) ?? "" })),
        offer_deadline: form.offer_deadline || null,
        offer_countdown_end: form.offer_countdown_end,
        offer_utm: form.offer_utm,
        sales_show_real: form.sales_show_real,
        sales_where: form.sales_where,
        registration_button_text: form.registration_button_text.trim() || "Entrar na sala",
        registration_progress_enabled: form.registration_progress_enabled,
        registration_progress_value: Math.min(100, Math.max(0, Number(form.registration_progress_value) || 0)),
        registration_badge_text: form.registration_badge_text.trim().slice(0, 40),
        entry_fields: entryFields,
        registration_collect_phone: Boolean(whatsapp),
        registration_require_phone: Boolean(whatsapp?.required),
        entry_card_color: form.entry_card_color,
        entry_button_color: form.entry_button_color,
        ...(videoChanged
          ? { video_url: url, video_provider: selectedVideo?.provider ?? null, duration_seconds: selectedVideo?.duration_seconds ?? 0 }
          : {}),
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [form, entryFields, extraOffers, selectedVideo, webinar, savedSnapshot, webinarId]);
  // Ao fechar o editor o rascunho sai: a sala de teste volta ao que está guardado.
  useEffect(() => {
    const clear = () => writeRoomDraft(webinarId, null);
    window.addEventListener("pagehide", clear);
    return () => {
      window.removeEventListener("pagehide", clear);
      clear();
    };
  }, [webinarId]);

  /* ---------- Desenho ---------- */

  if (loading)
    return (
      <AppShell title="A carregar webinar" action={false}>
        <PageSkeleton variant="editor" />
      </AppShell>
    );

  if (!webinar)
    return (
      <AppShell title="Webinar não encontrado" action={false}>
        <p className="text-sm text-muted-foreground">Este webinar não existe ou não pertence ao seu workspace.</p>
      </AppShell>
    );

  const baseUrl = publicOrigin();
  const roomOrigin = baseUrl.replace(/^https?:\/\//, "");
  const roomSlug = slugify(form.slug || form.public_title || form.internal_name);
  const roomLink = `${baseUrl}/w/${roomSlug}`;
  const active = STEP_UI[step];
  const videoUrl = selectedVideo?.source_url && /^https?:\/\//i.test(selectedVideo.source_url) ? selectedVideo.source_url : null;
  const sales = simulatedPurchases.map((p) => ({
    id: p.id,
    at: p.offset_seconds,
    buyer: p.buyer_name,
    product: p.product_name || product.trim() || "a vaga",
  }));
  const shownSales = salesEnabled ? sales : [];
  const viewers = format === "off" ? null : format === "real" ? 1 : curveValueAt(curve, t, duration);
  const nextWindow = sessionWindow(
    {
      schedule_mode: form.schedule_mode,
      scheduled_at: isoFromLocalInput(form.scheduled_at, form.timezone),
      recurrence_enabled: form.recurrence_enabled,
      recurrence_pattern: form.recurrence_pattern,
      recurrence_weekday: Number(form.recurrence_weekday) || 0,
      recurrence_start_time: form.recurrence_times[0] ?? form.recurrence_start_time,
      recurrence_days: form.recurrence_days,
      recurrence_times: form.recurrence_times,
      jit_interval_minutes: Number(form.jit_interval_minutes) || 15,
      jit_skip_night: form.jit_skip_night,
      timezone: form.timezone,
      duration_seconds: duration,
    },
    Date.now(),
  );
  const nextSession = nextWindow.startMs ? formatSessionStart(nextWindow.startMs, form.timezone) : null;
  const offers: OfferSlot[] = [
    ...(offerVisible
      ? [
          {
            id: "main",
            start: pitchSeconds ?? 0,
            end: form.cta_end_seconds.trim() ? Number(form.cta_end_seconds) || null : null,
            product,
            priceFrom: form.cta_price_original,
            priceNow: form.cta_price_now,
            url: form.cta_url,
            button: form.cta_text || "Quero minha vaga",
            countdown: Number(form.cta_countdown_seconds) || 0,
          },
        ]
      : []),
    ...(offerVisible ? extraOffers : []),
  ];
  const offerClosed = offerDeadlinePassed(form.offer_deadline, form.timezone, Date.now());
  const needsVideo = NEEDS_VIDEO.includes(step) && !selectedVideo;

  // A Revisão: os avisos de lançamento acima e o que só ela vê (chat vazio, fala sem transcrição, automações por completar).
  const agentRow = agentBundle?.agent;
  const reviewFacts = {
    title: form.public_title,
    hostName: form.host_name,
    fields: entryFields.length,
    video: selectedVideo ? duration : null,
    // Enquanto a análise carrega, não se acusa a falta dela.
    audience: { format, min: range.min, max: range.max, analysed: analysisPending || moments.length > 0 },
    comments: comments.length,
    countries: chatRules.countries.length,
    offer: offerVisible ? { product, pitch: pitchSeconds } : null,
    // A mesma conta do passo Vendas: menos de 3 s entre compras depois do pitch.
    sales: {
      enabled: salesEnabled,
      count: salesCount,
      crowded: Math.max(12, duration - (pitchSeconds ?? 0) - 6) / Math.max(1, salesCount) < 3,
    },
    automations: automations
      ? {
          workflow: automations.workflows.length > 0,
          total: automations.automations.length,
          active: automations.automations.filter((a) => a.active).length,
          // Só as mensagens: os canais são da conta (Integrações), não deste webinar.
          incomplete: automations.automations.filter((a) => activationBlockers(readSteps(a.steps), channelStatus(true, true, true)).length > 0).length,
        }
      : null,
    agent: agentRow ? { on: Boolean(agentRow["enabled"]) && agentRow["mode"] !== "desativado", name: String(agentRow["agent_name"] || "Equipa") } : null,
    session: scheduleKind === "ondemand" ? null : nextSession ?? "Sem data",
  };
  // Os mesmos pontos na Revisão, no cabeçalho, na barra das etapas e na página depois de publicar.
  const reviewList: ReviewIssue[] = [...launchIssues, ...reviewIssues(reviewFacts)];
  const stepsWithIssues = new Set<EditorStep>(reviewList.map((issue) => issue.step));
  // A geração com IA: a decorrer, pronta (rever sem gerar outra vez, que gastava créditos) ou parada com erro.
  const aiSteps: EditorStep[] = ["chat", "audiencia"];
  const fixing =
    aiJob?.status === "running"
      ? { steps: aiSteps, label: `${AI_JOB_STAGES[aiJob.stage] ?? "A trabalhar"}…` }
      : aiJob?.status === "ready" && aiJob.drafts?.length
        ? { steps: aiSteps, onReview: () => (setStep("chat"), setAiOpen(true)) }
        : aiJob?.status === "error" && aiJob.error
          ? { steps: aiSteps, error: aiJob.error }
          : null;
  const runFix = (fix: ReviewFix) => {
    if (fix === "pitch" && suggestedPitch !== null) set({ cta_start_seconds: String(suggestedPitch) });
    if (fix === "comments") void generate();
  };

  // O ecrã que cada etapa mostra.
  type Screen = "entry" | "room" | "waiting" | "whatsapp";
  const stepScreen: Screen =
    step === "inicio"
      ? "entry"
      : step === "entrada"
        ? entryView === "page"
          ? "entry"
          : "room"
        : step === "agenda"
          ? form.waiting_room_enabled && scheduleKind !== "ondemand" && nextWindow.startMs && nextWindow.startMs > Date.now()
            ? "waiting"
            : "entry"
          : step === "automacoes"
            ? "whatsapp"
            : "room";
  // A barra das fases manda no ecrã até se mudar de etapa.
  const screen: Screen = phase === "inscricao" ? "entry" : phase === "espera" ? "waiting" : phase ? "room" : stepScreen;
  const defaultTab: RoomTab = step === "oferta" && !phoneWebinar ? "offer" : step === "agente" ? "support" : "chat";
  const tab = roomTab ?? defaultTab;
  // No ecrã inteiro, o título é a fase que se vê (Inscrição, Espera, Ao vivo, Fim).
  const shownPhase = phaseOf(screen, t, duration);
  const screenName = shownPhase ? PHASE_NAME[shownPhase] : "WhatsApp";
  const screenDevice: Device = screen === "whatsapp" ? "phone" : device;
  // A barra de estado do aparelho (relógio) no tema do ecrã: as três pré-visualizações usam a mesma.
  const stageLight = screen === "whatsapp" || (previewTheme === "light" && !(screen === "room" && form.room_format === "live" && videoShape === "vertical"));
  // Só a sala roda (o telemóvel e o tablet deitados); a página e a espera ficam ao alto.
  const rotated = screenDevice !== "desktop" && landscape && screen === "room";
  const live = entryLiveLabel(nextWindow.startMs, form.timezone, Date.now());

  const room = (
    <RoomPreview
      device={screenDevice === "desktop" ? "desktop" : rotated ? `${screenDevice}-landscape` : screenDevice}
      live={form.room_format === "live"}
      videoShape={videoShape}
      entryShown={step === "video"}
      liveSettings={form.live}
      theme={previewTheme}
      appearance={previewAppearance}
      onAppearance={setPreviewAppearance}
      t={t}
      playing={playing}
      onTogglePlay={togglePlay}
      duration={duration}
      video={{ url: videoUrl, provider: selectedVideo?.provider ?? null }}
      volume={volume}
      onVolume={(v) => {
        soundChosen.current = true;
        setVolume(v);
      }}
      captionsOn={captionsOn}
      onCaptions={setCaptionsOn}
      speech={speech}
      title={form.public_title}
      host={{ name: form.host_name, role: form.host_role, avatarUrl: form.host_avatar_url, verified: form.host_verified }}
      viewers={viewers}
      pin={form.chat_pin_title.trim()}
      comments={comments.map((c) => ({ id: c.id, at: c.offset_seconds, author: c.author_name, message: c.message }))}
      sales={shownSales}
      salesWhere={form.sales_where}
      saleColor={saleColorNow}
      offers={offers}
      offerImageUrl={form.cta_image_url || undefined}
      offerClosed={offerClosed}
      offerCloseAtZero={form.offer_countdown_end === "close"}
      offerTimezone={form.timezone}
      agent={agentState}
      tab={tab}
      onTab={setRoomTab}
      forceOffer={step === "oferta"}
      highlight={focusKey}
      mine={mine}
      onSend={(text, where) => setMine((list) => [...list, { at: t, text, tab: where }])}
      reactions={reactions}
      onHeart={heart}
      onBuy={() => toast(`Abre o checkout num separador novo${form.offer_utm ? ", com a origem da pessoa" : ""}.`)}
    />
  );
  const titleOnly = step === "inicio" && !phase;
  const entry = (
    <EntryScreen
      preview
      className={
        screenDevice === "phone" ? "h-[852px] w-[393px] pt-[60px]" : screenDevice === "tablet" ? "h-[1180px] w-[820px] pt-[40px]" : "h-[720px] w-[1280px]"
      }
      theme={previewTheme}
      title={form.public_title}
      live={live.live}
      liveLabel={live.label}
      video={videoUrl && selectedVideo?.provider === "upload" ? { url: videoUrl, startSeconds: 0 } : null}
      // No Início a página mostra só o que se preencheu ali (o título); os campos e o botão entram na etapa Página
      // (ou quando se escolhe a fase Inscrição).
      buttonText={titleOnly ? "" : form.registration_button_text || "Entrar na sala"}
      notice={titleOnly ? null : entryNotice(form)}
      fields={titleOnly ? [] : entryFields}
      values={{}}
      country={{ code: "AO", name: "Angola", dial: "+244", flag: "🇦🇴" }}
      cardColor={form.entry_card_color}
      buttonColor={form.entry_button_color}
      highlight={focusKey}
    />
  );
  const waitingStart = nextWindow.startMs && nextWindow.startMs > Date.now() ? nextWindow.startMs : Date.now() + 26 * 3600_000;
  const waitingCountdown = roomCountdown(form.live.countdown, webinar);
  const waitingVideo = videoSources.find((v) => v.id === form.live.waiting.video);
  const screenBody =
    screen === "room" ? (
      room
    ) : screen === "entry" ? (
      entry
    ) : screen === "waiting" ? (
      // A sala de espera da sala pública, com o estilo e a cor da contagem; sem sessão marcada, conta até amanhã.
      <div style={screenDevice === "desktop" ? { width: 1280, height: 720 } : { width: SCREEN_SIZES[screenDevice].w, height: SCREEN_SIZES[screenDevice].h }}>
        <WaitingScreen
          title={form.public_title}
          startMs={waitingStart}
          opensMs={waitingStart - waitingCountdown.seconds * 1000}
          timezone={form.timezone}
          themeClass={cn(previewTheme === "light" && "room-light", "!min-h-full h-full")}
          style={waitingCountdown.style}
          color={waitingCountdown.color}
          onZero={NOOP}
          highlight={focusKey === "date"}
          video={waitingVideo?.source_url ? { url: waitingVideo.source_url, provider: waitingVideo.provider } : null}
          showCountdown={form.live.waiting.countdown}
        />
      </div>
    ) : (
      <WhatsAppPreview
        hostName={form.host_name}
        empty="Ainda sem mensagens. Crie as automações para ver o que cada pessoa recebe."
        bubbles={
          automations?.workflows.length
            ? [
                { tag: "Lembretes · 15 min antes", text: `Olá Marta! Faltam 15 minutos para «${form.public_title}». Entra por aqui: ${roomLink}`, time: "19:45" },
                { tag: "Sessão começou", text: `Marta, já estamos ao vivo. ${form.host_name.split(" ")[0] || "O apresentador"} começou agora: ${roomLink}`, time: "20:02" },
                {
                  tag: "Assistiu o pitch · 1 h depois",
                  text: `Marta, viste a aula até à oferta. ${product.trim() || "A oferta"}${form.cta_price_now ? ` por ${form.cta_price_now}` : ""} está aqui: ${form.cta_url || roomLink}`,
                  time: "21:06",
                },
              ]
            : []
        }
      />
    );

  // Os ecrãs por baixo do aparelho: na Página, a página e a sala; nas etapas da sala, os ecrãs dela.
  const tabs: ScreenTab[] =
    step === "entrada" || step === "inicio"
      ? [
          { key: "page", label: "Página", active: screen === "entry", onClick: () => (setStepState("entrada"), setPhase(null), setEntryView("page")) },
          {
            key: "room",
            label: "Na sala",
            active: step === "entrada" && entryView === "room",
            onClick: () => (setStepState("entrada"), setPhase(null), setEntryView("room")),
          },
        ]
      : screen === "room"
        ? SCREENS.map(([target, label]) => ({
            key: target,
            label,
            active: step === target || (target === "vendas" && step === "oferta"),
            onClick: () => setStep(target),
          }))
        : [];
  // Na barra do leitor: onde abrem as ofertas e onde aparece o + Seguir.
  const playMarks = [
    ...offers.map((o) => ({ at: o.start, label: o.id === "main" ? "Oferta" : "Oferta extra", tone: "offer" as const })),
    ...form.live.moments.map((m) => ({ at: m.start, label: "+ Seguir", tone: "follow" as const })),
  ];
  const play =
    screen === "room" && duration > 0 && !needsVideo ? (
      <PlayChip t={t} duration={duration} playing={playing} onToggle={togglePlay} onSeek={seek} marks={playMarks} />
    ) : null;

  // As fases da sala (Inscrição, Espera, Ao vivo, Fim): o ecrã de cada uma é o da sala pública.
  const pickPhase = (next: Phase) => {
    setPhase(next);
    setPlaying(false);
    if (next === "fim") seek(duration);
    if (next === "aovivo" && duration > 0 && t >= duration - 0.5) seek(pitchSeconds ?? suggestedPitch ?? 0);
  };
  const phaseBar = (dark?: boolean) => (
    <PhaseBar
      phase={phaseOf(screen, t, duration)}
      onPick={pickPhase}
      off={
        scheduleKind === "ondemand"
          ? { espera: "«Sempre disponível»: cada pessoa começa quando entra, sem espera." }
          : !form.waiting_room_enabled
            ? { espera: "Sala de espera desligada na Agenda." }
            : !nextWindow.startMs
              ? { espera: "Sem data marcada na Agenda." }
              : undefined
      }
      dark={dark}
    />
  );

  const tools = (
    <span className="flex shrink-0 items-center gap-2">
      {screenDevice !== "desktop" && screen === "room" ? <RotateButton landscape={landscape} onChange={setLandscape} /> : null}
      {wide ? <ZoomControl zoom={zoom} fit={fit} onZoom={setZoom} /> : null}
      <ExpandButton onClick={() => setFull(true)} />
      {screen !== "whatsapp" ? <DeviceToggle device={device} onChange={setDevice} /> : null}
    </span>
  );

  return (
    <AppShell action={false} bleed rail>
      {/* No computador, o editor ocupa o ecrã: a página não desliza, só o painel. */}
      <div className="flex flex-1 flex-col bg-background lg:fixed lg:inset-y-0 lg:left-[var(--shell-left,72px)] lg:right-0 lg:z-10 lg:transition-[left] lg:duration-300">
        <header className="grid shrink-0 border-b bg-background lg:grid-cols-[340px_minmax(0,1fr)]">
          <div className="flex h-12 min-w-0 items-center gap-1.5 border-b px-2.5 lg:border-r lg:border-b-0">
            <PhoneMenuButton />
            <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
              <Link to="/webinars" search={{ q: undefined }} aria-label="Voltar aos webinars">
                <ArrowLeft />
              </Link>
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-semibold">{form.public_title || form.internal_name || "Webinar sem título"}</p>
              <p className="flex items-center gap-1.5 truncate text-[11.5px] text-muted-foreground">
                <span className={cn("size-1.5 rounded-full", form.status === "draft" ? "bg-gray-400" : "bg-[#1D8A5E]")} />
                {lifecycleLabel(lifecycle)}
                {dirty ? <span> · por guardar</span> : null}
                {reviewList.length > 0 ? <span className="text-warning"> · {reviewList.length} por resolver</span> : null}
              </p>
            </div>
            <Button variant="ghost" size="icon" className="size-8 shrink-0" asChild>
              <a href={`${roomLink}?teste=1`} target="_blank" rel="noopener noreferrer" aria-label="Sala de teste" title="Sala de teste: entra já e não conta nas métricas">
                <Eye />
              </a>
            </Button>
            {/* Publicar passa pela Revisão; na Revisão, publica. */}
            <Button
              variant="dark"
              size="sm"
              className="shrink-0"
              onClick={step === "revisao" ? publish : () => setStep("revisao")}
              disabled={saving || (step === "revisao" && !reviewDone)}
            >
              {saving ? <Loader2 className="animate-spin" /> : null}
              Publicar
            </Button>
          </div>
          <nav
            aria-label="Etapas"
            className="flex min-w-0 items-center overflow-x-auto px-2 [justify-content:safe_center] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {STEPS.map((s, index) => {
              const Icon = s.icon;
              const current = s.id === step && !published;
              return (
                <Fragment key={s.id}>
                  {index > 0 && STEPS[index - 1]?.group !== s.group ? <span aria-hidden className="mx-1 h-[18px] w-px shrink-0 bg-border" /> : null}
                  <button
                    type="button"
                    onClick={() => setStep(s.id)}
                    aria-current={current ? "step" : undefined}
                    title={`${GROUP_NAME[s.group]} · ${s.title}`}
                    className={cn(
                      "relative flex h-12 shrink-0 items-center gap-1.5 px-2 text-[13px] font-medium whitespace-nowrap transition-colors",
                      current
                        ? "text-foreground after:absolute after:inset-x-1.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {s.label}
                    {stepsWithIssues.has(s.id) ? <span className="size-1.5 rounded-full bg-warning" title="Por resolver" /> : null}
                  </button>
                </Fragment>
              );
            })}
          </nav>
        </header>

        {published ? (
          <PublishPage issues={reviewList} roomLink={roomLink} onResolve={setStep} onBack={() => setPublished(false)} />
        ) : (
          <div
            className={cn(
              "grid min-h-0 flex-1 lg:transition-[grid-template-columns] lg:duration-300",
              panelOpen ? "lg:grid-cols-[340px_minmax(0,1fr)]" : "lg:grid-cols-[56px_minmax(0,1fr)]",
            )}
          >
            <section data-editor-panel className="flex min-h-0 min-w-0 flex-col bg-background lg:border-r">
              {!wide ? (
                <div className="shrink-0 border-b">
                  {phoneScreen && !full ? (
                    <>
                      <div className="flex items-center justify-between gap-2 px-4 pt-2.5">
                        <span className="truncate text-[12px] text-muted-foreground">Pré-visualização</span>
                        {tools}
                      </div>
                      <div className="flex justify-center px-4 pt-2">{phaseBar()}</div>
                      <div className={cn("px-2", panelOpen ? "h-[min(64dvh,600px)]" : "h-[max(min(64dvh,600px),calc(100dvh-22rem))]")}>
                        <DeviceStage
                          device={screenDevice}
                          landscape={rotated}
                          url={`${roomOrigin}/w/${roomSlug}`}
                          light={stageLight}
                          dock={{ play, tabs: tabs.length ? <ScreenTabs tabs={tabs} /> : null }}
                        >
                          {screenBody}
                        </DeviceStage>
                      </div>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setPhoneScreen((v) => !v)}
                    aria-expanded={phoneScreen}
                    className="flex h-9 w-full items-center justify-center gap-2 text-[12.5px] font-medium text-muted-foreground"
                  >
                    <span className="block h-1 w-9 rounded-full bg-black/15" />
                    {phoneScreen ? "Esconder o ecrã" : "Ver o ecrã"}
                  </button>
                </div>
              ) : null}
              {wide && !panelOpen ? (
                <div className="flex flex-col items-center gap-2 pt-3">
                  <PanelToggle open={false} wide onClick={() => setPanelOpen(true)} />
                  <button
                    type="button"
                    onClick={() => setPanelOpen(true)}
                    title={active.title}
                    aria-label={`Abrir o painel: ${active.title}`}
                    className="grid size-9 place-items-center rounded-lg bg-chip text-foreground"
                  >
                    <active.icon className="size-4" />
                  </button>
                </div>
              ) : null}
              <div className={cn("flex shrink-0 items-center gap-1 px-5 pb-1 pt-3.5", wide && !panelOpen && "hidden", !panelOpen && "pb-3")}>
                <h1 className="min-w-0 truncate text-[17px] font-semibold tracking-tight">{active.title}</h1>
                {active.help ? <HelpButton topic={active.help} /> : null}
                <span className="flex-1" />
                <PanelToggle open={panelOpen} wide={wide} onClick={() => setPanelOpen((v) => !v)} />
              </div>
              {/* Minimizado, o painel só se esconde: o que se escreveu numa etapa não se perde. */}
              <div className={cn("scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3.5", !panelOpen && "hidden")}>
                {needsVideo ? (
                  <div className="grid justify-items-start gap-3 rounded-xl border bg-white p-4">
                    <span className="grid size-10 place-items-center rounded-full bg-chip">
                      <Video className="size-5" />
                    </span>
                    <b className="text-[15px] font-semibold">Primeiro, o vídeo</b>
                    <p className="text-[13px] text-muted-foreground">
                      Esta etapa segue o tempo do vídeo: o que se escreve no chat, quando a oferta abre, quantas pessoas a sala mostra e
                      quando aparecem as compras. Carregue o vídeo e volte aqui.
                    </p>
                    <Button variant="dark" size="sm" onClick={() => setStep("video")}>
                      Ir para o Vídeo
                    </Button>
                  </div>
                ) : step === "inicio" ? (
                  <StepInicio
                    form={form}
                    set={set}
                    focus={focus}
                    roomOrigin={roomOrigin}
                    roomLink={roomLink}
                    uploading={uploadingImage}
                    onUpload={(file, field) => void uploadImage(file, field)}
                    onDelete={() => void removeWebinar()}
                  />
                ) : step === "entrada" ? (
                  <StepEntrada
                    form={form}
                    set={set}
                    focus={focus}
                    fields={entryFields}
                    onFields={setEntryFields}
                    colors={{ card: form.entry_card_color, button: form.entry_button_color }}
                    onColors={(c) => set({ entry_card_color: c.card, entry_button_color: c.button })}
                    mode={form.entry_mode}
                    onMode={(entry_mode) => set({ entry_mode })}
                    roomLink={roomLink}
                    embed={{
                      code: forms[0]
                        ? `<div data-novawebinar-form="${forms[0].id}"></div>\n<script src="${baseUrl}/api/public/forms/${forms[0].id}/embed" async></script>`
                        : null,
                      formId: forms[0]?.id ?? null,
                      creating: creatingForm,
                      onCreate: () => void createForm(),
                    }}
                  />
                ) : step === "video" ? (
                  <StepVideo
                    video={
                      selectedVideo
                        ? {
                            id: selectedVideo.id,
                            name: selectedVideo.name,
                            provider: selectedVideo.provider,
                            source_url: selectedVideo.source_url,
                            duration_seconds: selectedVideo.duration_seconds,
                            thumbnail_url: selectedVideo.thumbnail_url,
                          }
                        : null
                    }
                    library={videoSources.map((v) => ({
                      id: v.id,
                      name: v.name,
                      provider: v.provider,
                      source_url: v.source_url,
                      duration_seconds: v.duration_seconds,
                      thumbnail_url: v.thumbnail_url,
                    }))}
                    providerLabel={(p) => providerLabels[p as Provider] ?? p}
                    clock={editorClock}
                    transcript={speech}
                    onPick={(id) => void persistVideo(id)}
                    upload={{
                      state: videoUpload,
                      busy: uploading,
                      start: (file) => void uploadVideoFile(file),
                      pause: () => void videoUploadRef.current?.pause(),
                      resume: () => videoUploadRef.current?.resume(),
                      cancel: () => {
                        void videoUploadRef.current?.cancel();
                        videoUploadRef.current = null;
                        setVideoUpload(null);
                      },
                    }}
                    onAddLink={addVideoLink}
                    appearance={orgAppearance}
                    onAppearance={(a) =>
                      set(a === "system" ? { room_theme_system: true } : { room_theme_system: false, room_theme: a })
                    }
                    format={form.room_format}
                    onFormat={(room_format) => set({ room_format })}
                    live={form.live}
                    onLive={(patch) => setForm((prev) => ({ ...prev, live: { ...prev.live, ...patch } }))}
                  />
                ) : step === "chat" ? (
                  <StepChat
                    form={form}
                    set={set}
                    focus={focus}
                    rules={chatRules}
                    onRules={updateRules}
                    way={chatWay}
                    onWay={setChatWay}
                    questions={questions}
                    comments={comments.map((c) => ({
                      id: c.id,
                      at: c.offset_seconds,
                      author: c.author_name,
                      message: c.message,
                      type: c.comment_type ?? null,
                    }))}
                    clock={editorClock}
                    speechAt={speechAt}
                    job={
                      aiJob
                        ? {
                            running: aiJob.status === "running",
                            stage: aiJob.stage,
                            error: aiJob.status === "error" ? aiJob.error : "",
                            ready: aiJob.status === "ready" && Boolean(aiJob.drafts?.length),
                            onReview: () => setAiOpen(true),
                          }
                        : null
                    }
                    audience={simulatedAudience ? chatAudience : null}
                    product={product}
                    onGenerate={() => void generate()}
                    onImport={(file) => void importSheet(file)}
                    onWrite={writeComment}
                    onRemove={(id) => void removeComment(id)}
                    onEdit={editComment}
                    onShow={(comment) => {
                      // A sala vai para o minuto do comentário e realça-o no chat.
                      setPlaying(false);
                      setRoomTab("chat");
                      seek(comment.at + 0.5);
                      setFocusKey(`comment:${comment.id}`);
                    }}
                    onWatch={(seconds) => watchAt(seconds, "chat")}
                    notify={form.live.notify}
                    onNotify={(notify) => setForm((prev) => ({ ...prev, live: { ...prev.live, notify } }))}
                  />
                ) : step === "audiencia" ? (
                  <StepAudiencia
                    format={format}
                    onFormat={setFormat}
                    min={range.min}
                    max={range.max}
                    onRange={(min, max) => setRange({ min, max })}
                    curve={curve}
                    pitch={pitchSeconds ?? suggestedPitch}
                    clock={editorClock}
                    marks={{
                      offers: offers.map((o) => ({ start: o.start, end: o.end ?? duration, main: o.id === "main", name: o.product })),
                      follows: form.live.moments,
                      sales: shownSales.map((x) => x.at),
                    }}
                  />
                ) : step === "oferta" ? (
                  <StepOferta
                    form={form}
                    set={set}
                    focus={focus}
                    product={product}
                    onProduct={setProduct}
                    extras={extraOffers}
                    onExtras={setExtraOffers}
                    suggestedPitch={suggestedPitch}
                    clock={editorClock}
                    onWatch={(seconds) => watchAt(seconds - 1, phoneWebinar ? "chat" : "offer")}
                    onAfter={() => {
                      setPlaying(false);
                      setRoomTab("offer");
                      seek(duration);
                    }}
                    upload={{ uploading: uploadingImage, onFile: (file) => void uploadImage(file, "cta_image_url") }}
                  />
                ) : step === "vendas" ? (
                  <StepVendas
                    offerVisible={offerVisible}
                    pitch={pitchSeconds}
                    enabled={salesEnabled}
                    onEnabled={(on) => void setSales(on, salesCount)}
                    count={countDraft ?? salesCount}
                    onCount={setCountDraft}
                    color={saleColorNow}
                    onColor={pickSaleColor}
                    real={form.sales_show_real}
                    onReal={(sales_show_real) => set({ sales_show_real })}
                    where={form.sales_where}
                    onWhere={(sales_where) => set({ sales_where })}
                    sales={shownSales}
                    product={product}
                    clock={editorClock}
                    onGoOffer={() => setStep("oferta")}
                    onWatch={(seconds) => watchAt(seconds)}
                    busy={salesBusy}
                  />
                ) : step === "automacoes" ? (
                  <StepAutomacoes webinarId={webinarId} organizationId={organizationId} title={form.public_title || form.internal_name || "Webinar"} />
                ) : step === "agente" ? (
                  <StepAgente webinarId={webinarId} onState={setAgentState} onSeek={seek} />
                ) : step === "revisao" ? (
                  <StepRevisao
                    steps={STEPS.filter((s) => s.id !== "revisao")}
                    issues={reviewList}
                    summary={reviewSummary(reviewFacts)}
                    working={fixing}
                    onGo={setStep}
                    onFix={runFix}
                    onDone={() => setReviewDone(true)}
                  />
                ) : (
                  <StepAgenda
                    form={form}
                    set={set}
                    focus={focus}
                    kind={scheduleKind}
                    onKind={chooseScheduleKind}
                    nextSession={nextSession}
                    nextStartMs={nextWindow.startMs}
                    ended={sessionEnded}
                    theme={previewTheme}
                    fields={entryFields}
                    library={videoSources}
                    providerLabel={(p) => providerLabels[p as Provider] ?? p}
                  />
                )}
              </div>
              <footer
                className={cn(
                  // No telemóvel, com o menu aberto, fica por cima da barra de baixo.
                  "sticky bottom-[var(--shell-bottom,0px)] z-20 mt-auto shrink-0 border-t bg-background px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2.5 lg:static",
                  wide && !panelOpen && "hidden",
                )}
              >
                {/* Em que etapa está: um traço por etapa, cheio até à actual. */}
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex flex-1 gap-1" aria-hidden>
                    {STEPS.map((s, i) => (
                      <span
                        key={s.id}
                        className={cn("h-1 flex-1 rounded-full", i <= stepIndex ? "bg-foreground" : "bg-[var(--ds-gray-alpha-300)]")}
                      />
                    ))}
                  </div>
                  <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-muted-foreground">
                    {stepIndex + 1}/{STEPS.length}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Button variant="ghost" className="min-w-0 px-2.5" onClick={() => prevStep && setStep(prevStep.id)} disabled={!prevStep}>
                    <ArrowLeft />
                    <span className="truncate">{prevStep ? prevStep.label : "Voltar"}</span>
                  </Button>
                  {/* No telemóvel, a pré-visualização abre em ecrã inteiro. */}
                  <Button
                    variant="outline"
                    className="shrink-0 px-3 lg:hidden"
                    onClick={() => {
                      setDevice("phone");
                      setFull(true);
                    }}
                  >
                    <Eye />
                    Ver
                  </Button>
                  <Button variant="dark" className="min-w-0" onClick={saveAndGo} disabled={saving || (step === "revisao" && !reviewDone)}>
                    {saving ? <Loader2 className="animate-spin" /> : null}
                    <span className="truncate">{nextStep ? `Continuar: ${nextStep.label}` : "Publicar"}</span>
                    {nextStep ? <ArrowRight /> : null}
                  </Button>
                </div>
              </footer>
            </section>

            <section className="hidden min-w-0 flex-col bg-[var(--background)] lg:flex lg:min-h-0">
              <div className="flex shrink-0 items-center gap-3 px-4 pt-2.5">
                <span className="flex min-w-0 flex-1">{phaseBar()}</span>
                {tools}
              </div>
              <div className="min-h-0 flex-1 pb-3">
                {/* Os ecrãs ficam por baixo do aparelho, alinhados com ele, como no ManyChat. */}
                {wide ? (
                <DeviceStage
                  device={screenDevice}
                  landscape={rotated}
                  url={`${roomOrigin}/w/${roomSlug}`}
                  highlightUrl={focusKey === "url"}
                  light={stageLight}
                  zoom={zoom}
                  onFit={full ? undefined : setFit}
                  dock={{ play, tabs: tabs.length ? <ScreenTabs tabs={tabs} /> : null }}
                >
                  {screenBody}
                </DeviceStage>
                ) : null}
              </div>
            </section>
          </div>
        )}
      </div>

      {full ? (
        <FullScreen
          name={screenName}
          device={screenDevice}
          onDevice={setDevice}
          onClose={() => setFull(false)}
          tools={<ZoomControl dark zoom={zoom} fit={fit} onZoom={setZoom} />}
          phases={phaseBar(true)}
        >
          <DeviceStage
            device={screenDevice}
            landscape={rotated}
            url={`${roomOrigin}/w/${roomSlug}`}
            light={stageLight}
            dark
            zoom={zoom}
            onFit={setFit}
            dock={{
              play:
                screen === "room" && duration > 0 && !needsVideo ? (
                  <PlayChip t={t} duration={duration} playing={playing} onToggle={togglePlay} onSeek={seek} marks={playMarks} dark />
                ) : null,
              tabs: tabs.length ? <ScreenTabs tabs={tabs} dark /> : null,
            }}
          >
            {screenBody}
          </DeviceStage>
        </FullScreen>
      ) : null}

      <AiCommentsDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        webinarId={webinarId}
        webinarTitle={form.public_title || form.internal_name || "Webinar"}
        existing={comments.map((c) => ({ at: c.offset_seconds, author: c.author_name, message: c.message }))}
        replaceAll
        transcript={transcript}
        mediaUrl={selectedVideo?.source_url ?? null}
        onSeek={seek}
        onTranscript={keepTranscript}
        onInsert={(drafts) => insertGenerated(drafts)}
      />
    </AppShell>
  );
}

/** O botão do menu principal no telemóvel (no computador e no tablet está na barra lateral). */
function PhoneMenuButton() {
  const menu = useShellMenu();
  if (!menu) return null;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8 shrink-0 md:hidden"
      onClick={menu.toggle}
      aria-expanded={menu.open}
      aria-label={menu.open ? "Recolher o menu principal" : "Abrir o menu principal"}
      title={menu.open ? "Recolher o menu" : "Abrir o menu"}
    >
      <Menu />
    </Button>
  );
}

/** Minimizar e abrir o painel de configuração: à esquerda no computador, por baixo da pré-visualização num ecrã estreito. */
function PanelToggle({ open, wide, onClick }: { open: boolean; wide: boolean; onClick: () => void }) {
  const Icon = wide ? (open ? PanelLeftClose : PanelLeftOpen) : open ? PanelBottomClose : PanelBottomOpen;
  const label = open ? "Minimizar o painel de configuração" : "Abrir o painel de configuração";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={label}
      title={open ? "Minimizar o painel" : "Abrir o painel"}
      className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-[var(--hover-ghost)] hover:text-foreground"
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
