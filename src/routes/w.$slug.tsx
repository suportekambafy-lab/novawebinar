import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { formatSessionStart } from "@/lib/schedule";
import { detectDevice, lookupPlace, type GeoPlace } from "@/lib/live-presence";
import { leadSource } from "@/lib/contacts";
import { loadPixels, trackPixels } from "@/lib/pixels";
import { retry } from "@/lib/utils";
import {
  DEFAULT_PHONE_COUNTRY,
  phoneCountryForIso,
  type PhoneCountry,
} from "@/lib/phone-countries";
import { WebinarRoom, type RoomProgressOptions } from "@/components/webinar-room";
import { ROOM_VIEWPORT } from "@/lib/room-viewport";
import { RoomSkeleton, getCachedRoomTheme, cacheRoomTheme } from "@/components/room-skeleton";
import { EntryScreen, entryLiveLabel, isDirectVideo } from "@/components/room/entry-screen";
import { programmedAppearance, useRoomAppearance } from "@/lib/room-theme";
import { entryNotice, parseEntryFields, validateEntry } from "@/lib/entry-fields";
import { offerDeadlinePassed, parseExtraOffers, roomCountdown } from "@/lib/room-logic";
import { useRoomTeam, type TeamRole } from "@/lib/room-team";
import { checkTeamRoomToken, getTeamRoomToken } from "@/lib/room-team.functions";
import { recordRoomHearts } from "@/lib/room-reactions.functions";
import { getViewerState } from "@/lib/room-viewer.functions";
import { viewerPlan, type ViewerPlan } from "@/lib/room-return";
import { useDataSaver } from "@/lib/room-data-saver";
import { applyRoomDraft, useRoomDraft } from "@/lib/room-draft";
import { TeamEntry, TeamNotice } from "@/components/room/team-entry";
import { WaitingScreen } from "@/components/room/waiting-screen";
import { preliveTitle } from "@/lib/prelive-templates";

import {
  getPublicRoom,
  joinPublicRoom,
  getPublicRoomMessages,
  joinOfferGroup,
  sendPublicRoomMessage,
  trackPublicRoomCta,
  trackPublicRoomProgress,
  VIEWER_EXPIRED,
} from "@/lib/public-room.functions";

/** A origem (UTM) do endereço, para a atribuição de um teste A/B. */
function roomUtm(search: Record<string, unknown>) {
  const pick = (key: "utm_source" | "utm_medium" | "utm_campaign" | "utm_content") =>
    typeof search[key] === "string" && search[key]
      ? { [key]: String(search[key]).slice(0, 120) }
      : {};
  return {
    ...pick("utm_source"),
    ...pick("utm_medium"),
    ...pick("utm_campaign"),
    ...pick("utm_content"),
    // Pré-visualização de uma variante de um teste A/B: só para o organizador ver as duas.
    ...(typeof search["variante"] === "string" && search["variante"]
      ? { variante: String(search["variante"]).slice(0, 2) }
      : {}),
  };
}

export const Route = createFileRoute("/w/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    replay: ["1", "true"].includes(String(search["replay"])) ? true : undefined,
    // Sala de teste: qualquer pessoa com o link entra de imediato, mesmo com a
    // sessão inativa ou fora do horário. Serve para rever a sala antes de abrir.
    teste: ["1", "true"].includes(String(search["teste"])) ? true : undefined,
    // Entrada com dados (links dos e-mails e do WhatsApp): abre já o cartão preenchido.
    nome: typeof search["nome"] === "string" ? search["nome"].slice(0, 80) : undefined,
    email: typeof search["email"] === "string" ? search["email"].slice(0, 160) : undefined,
    // Link de equipa: «1» com sessão iniciada na organização, ou o código do link copiado na Vista ao vivo.
    equipa:
      typeof search["equipa"] === "string" && search["equipa"]
        ? search["equipa"].slice(0, 200)
        : undefined,
    // Pré-visualização de uma variante de um teste A/B («A», «B»…).
    variante:
      typeof search["variante"] === "string" && search["variante"]
        ? search["variante"].slice(0, 2)
        : undefined,
    // Origem do lead: fica no endereço até à inscrição.
    ...(Object.fromEntries(
      ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid", "gclid"]
        .filter((key) => typeof search[key] === "string" && search[key])
        .map((key) => [key, String(search[key]).slice(0, 200)]),
    ) as Partial<
      Record<
        "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "fbclid" | "gclid",
        string
      >
    >),
  }),
  loader: ({ context, params, location }) =>
    context.queryClient
      .ensureQueryData({
        queryKey: ["public-room", params.slug],
        queryFn: () =>
          getPublicRoom({
            data: { slug: params.slug, ...roomUtm(location.search as Record<string, unknown>) },
          }),
      })
      // Falha passageira: a página abre na mesma e a sala volta a tentar sozinha.
      .catch(() => undefined),
  head: ({ loaderData }) => {
    const webinar = loaderData?.webinar;
    const title = webinar?.share_title || webinar?.public_title || "Sala do webinar";
    const description =
      webinar?.share_description || webinar?.description || "Entre na sala e acompanhe a sessão.";
    const image = webinar?.share_image_url || webinar?.registration_cover_url || null;
    return {
      meta: [
        { title: `${title} | Novawebinar` },
        ROOM_VIEWPORT,
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(image
          ? [
              { property: "og:image", content: image },
              { name: "twitter:image", content: image },
            ]
          : []),
      ],
    };
  },
  component: PublicRoomRoute,
});

function PublicRoomRoute() {
  const { slug } = Route.useParams();
  const { replay, teste, nome, email, equipa, ...source } = Route.useSearch();
  return (
    <PublicRoom
      slug={slug}
      replay={replay}
      teste={teste}
      equipa={equipa}
      source={source}
      prefill={nome || email ? { name: nome ?? "", email: email ?? "" } : undefined}
    />
  );
}

type Viewer = {
  /** Credencial da sala emitida pelo servidor ao entrar (não é só o id da participação). */
  token: string;
  name: string;
  /** Última posição do vídeo desta pessoa (relógio de conteúdo). */
  position?: number;
  /** Ponto mais avançado já visto: evita repetir eventos ao recuar num replay. */
  maxPosition?: number;
};

function storageKey(slug: string) {
  return `novawebinar:viewer:${slug}`;
}

// O armazenamento pode estar bloqueado (cookies desligados, sala num iframe de outro site): quem se
// inscreve entra na mesma, só não fica lembrado para a próxima visita.
function rememberViewer(slug: string, viewer: Viewer) {
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify(viewer));
  } catch {
    /* só nesta visita */
  }
}
function forgetViewer(slug: string) {
  try {
    window.localStorage.removeItem(storageKey(slug));
  } catch {
    /* nada guardado */
  }
}

export function PublicRoom({
  slug,
  replay,
  teste,
  equipa,
  source = {},
  prefill,
}: {
  slug: string;
  replay?: boolean | undefined;
  teste?: boolean | undefined;
  /** Entrar como equipa: «1» (sessão iniciada) ou o código do link de equipa. */
  equipa?: string | undefined;
  /** Parâmetros de origem do endereço (utm_*, fbclid, gclid). */
  source?: Partial<Record<string, string>>;
  /** Nome e e-mail que vêm no link: o cartão abre já preenchido. */
  prefill?: { name: string; email: string } | undefined;
}) {
  const testMode = Boolean(teste);
  const roomMode: "live" | "replay" = replay ? "replay" : "live";
  const fetchRoom = useServerFn(getPublicRoom);
  const join = useServerFn(joinPublicRoom);
  const sendMessage = useServerFn(sendPublicRoomMessage);
  const trackCta = useServerFn(trackPublicRoomCta);
  const joinGroup = useServerFn(joinOfferGroup);
  const fetchMessages = useServerFn(getPublicRoomMessages);
  const trackProgress = useServerFn(trackPublicRoomProgress);
  const saveHearts = useServerFn(recordRoomHearts);

  const [viewer, setViewer] = useState<Viewer | null>(null);
  const saveData = useDataSaver();
  // O que a pessoa escreve, campo a campo (pelo id do campo).
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...(prefill?.name ? { name: prefill.name } : {}),
    ...(prefill?.email ? { email: prefill.email } : {}),
  }));
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>(DEFAULT_PHONE_COUNTRY);
  const [entering, setEntering] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<string | undefined>(undefined);

  const [waiting, setWaiting] = useState(true);

  // O indicativo vem pré-selecionado pela localização por endereço de rede
  // (Portugal → +351); a pessoa pode sempre trocar de país na lista.
  const placeRef = useRef<GeoPlace | null>(null);
  useEffect(() => {
    let active = true;
    void lookupPlace().then((place) => {
      if (!active) return;
      placeRef.current = place;
      const match = phoneCountryForIso(place.countryCode);
      if (match) setPhoneCountry(match);
    });
    return () => {
      active = false;
    };
  }, []);

  // Dispositivo e origem por endereço de rede: servem as estatísticas do painel.
  const audienceMeta = useCallback(
    () => ({
      device: detectDevice(),
      city: placeRef.current?.city ?? undefined,
      country: placeRef.current?.country ?? undefined,
      countryCode: placeRef.current?.countryCode ?? undefined,
      ...leadSource({
        ...source,
        referrer: document.referrer,
        ownHost: window.location.hostname,
      }),
    }),
    [source],
  );

  const {
    data: loaded,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["public-room", slug],
    queryFn: () => fetchRoom({ data: { slug, ...roomUtm(source) } }),
    // Enquanto ninguém entrou na sala, revemos a sessão de minuto a minuto:
    // assim que a sessão do dia termina, a sala de espera volta a abrir
    // com a contagem para a próxima sessão. Uma leitura falhada nunca tira a
    // sala a quem a tem aberta: fica a que já estava e tenta-se outra vez.
    refetchInterval: (query) => (query.state.status === "error" ? 5000 : viewer ? false : 60_000),
    // A sala veio no HTML (loader): não se volta a pedir logo a seguir a abrir a página.
    staleTime: 60_000,
  });
  // Sala de teste: por cima do que está guardado, o que o organizador está a mudar no editor (mesmo sem
  // guardar), ao vivo. A sala pública nunca lê o rascunho.
  const draft = useRoomDraft(testMode ? loaded?.webinar.id : null);
  const data = useMemo(
    () =>
      loaded && draft ? { ...loaded, webinar: applyRoomDraft(loaded.webinar, draft) } : loaded,
    [loaded, draft],
  );

  // Aparência: a programada no editor, ou a que a pessoa escolheu no ⚙ do vídeo (uma por sala, neste
  // browser). Na sala de teste experimenta-se sem guardar, para nunca mudar a sala a sério.
  const {
    appearance,
    theme,
    choose: chooseAppearance,
  } = useRoomAppearance(
    data ? programmedAppearance(data.webinar) : "dark",
    testMode ? null : `cw:room-appearance:${slug}`,
  );

  // A equipa: confirma o link (ou a sessão iniciada na organização) e guarda o nome escolhido neste browser.
  const getTeamToken = useServerFn(getTeamRoomToken);
  const checkTeamToken = useServerFn(checkTeamRoomToken);
  const [teamToken, setTeamToken] = useState<string | "checking" | "denied" | null>(
    equipa ? "checking" : null,
  );
  const [member, setMember] = useState<{ name: string; role: TeamRole } | null>(null);
  const memberKey = `cw:equipa:${slug}`;
  const teamWebinarId = data?.webinar.id;
  useEffect(() => {
    if (!equipa || !teamWebinarId) return;
    let active = true;
    const ask =
      equipa === "1"
        ? getTeamToken({ data: { webinarId: teamWebinarId } }).then((r) => r.token)
        : checkTeamToken({ data: { webinarId: teamWebinarId, token: equipa } }).then((r) =>
            r.ok ? equipa : "denied",
          );
    ask.then(
      (token) => active && setTeamToken(token),
      () => active && setTeamToken("denied"),
    );
    return () => {
      active = false;
    };
  }, [equipa, teamWebinarId, getTeamToken, checkTeamToken]);
  const savedMember = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = JSON.parse(window.localStorage.getItem(memberKey) ?? "null") as {
        name?: unknown;
        role?: unknown;
      } | null;
      return typeof raw?.name === "string"
        ? {
            name: raw.name,
            role: raw.role === "apresentador" ? ("apresentador" as const) : ("equipa" as const),
          }
        : null;
    } catch {
      return null;
    }
  })();
  const teamReady =
    typeof teamToken === "string" &&
    teamToken !== "checking" &&
    teamToken !== "denied" &&
    member !== null;
  // Os comentários da equipa chegam a todos os que estão na sala, pelo canal da sala (só ao vivo).
  const teamChat = useRoomTeam(
    roomMode === "live" && teamWebinarId && (viewer || teamReady) ? teamWebinarId : null,
    teamReady ? { token: teamToken, name: member.name, role: member.role } : null,
  );

  // Pixels de anúncios da organização; a sala de teste e a equipa nunca os disparam.
  const pixels = data?.pixels;
  useEffect(() => {
    if (pixels && !testMode && !equipa) loadPixels(pixels);
  }, [pixels, testMode, equipa]);

  // Guardamos o tema da sala para o esqueleto seguir o mesmo aspeto. O tema
  // memorizado só é lido depois da hidratação: lê-lo durante a renderização
  // faria o servidor e o navegador desenharem ecrãs diferentes.
  const [skeletonTheme, setSkeletonTheme] = useState<"light" | "dark">("light");
  // A sala depende do relógio, do armazenamento local e da localização de quem
  // assiste: só a desenhamos depois de o navegador assumir a página, para que
  // o primeiro desenho seja sempre igual ao que veio do servidor.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    setSkeletonTheme(getCachedRoomTheme(slug));
  }, [slug]);
  useEffect(() => {
    if (data) cacheRoomTheme(slug, theme);
  }, [data, theme, slug]);

  // Quem regressa: a sala segue a sessão desta pessoa (não a próxima do webinar). Uma leitura por visita;
  // ao vivo pela ligação normal (no replay pelo link e na sala de teste, a sala de sempre).
  const fetchViewerState = useServerFn(getViewerState);
  const viewerState = useQuery({
    queryKey: ["viewer-state", viewer?.token],
    enabled: Boolean(viewer?.token) && !testMode && roomMode === "live",
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
    queryFn: () => fetchViewerState({ data: { token: viewer!.token } }),
  });
  const plan: ViewerPlan =
    data && viewer && !testMode && !equipa && roomMode === "live"
      ? viewerPlan(viewerState.data, {
          // A hora da leitura: o plano não muda a meio da visita (quem vê o fim ao vivo não passa para o replay).
          nowMs: viewerState.dataUpdatedAt,
          durationSeconds: data.webinar.duration_seconds,
          replayEnabled: Boolean(data.webinar.replay_enabled),
          schedule: data.webinar,
        })
      : { kind: "global" };

  // A sessão seguinte (ou a desta pessoa) ainda não começou: a sala de espera reabre sozinha.
  const nextStartMs =
    plan.kind === "session"
      ? plan.startMs
      : data?.webinar.session_start
        ? new Date(data.webinar.session_start).getTime()
        : null;
  useEffect(() => {
    if (nextStartMs !== null && nextStartMs > Date.now()) setWaiting(true);
  }, [nextStartMs]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey(slug));
      if (!stored) return;
      const parsed = JSON.parse(stored) as Viewer;
      // Entradas antigas guardavam só o id da participação: já não servem, a pessoa entra outra vez.
      if (!parsed?.token) {
        forgetViewer(slug);
        return;
      }
      if (parsed.name) {
        setViewer(parsed);
        // Com a sincronização desligada, o vídeo retoma a posição guardada.
        if (typeof parsed.position === "number" && parsed.position > 0) {
          setResumeSeconds(parsed.position);
        }
        if (typeof parsed.maxPosition === "number" && parsed.maxPosition > 0) {
          setResumePeakSeconds(parsed.maxPosition);
        }
      }
    } catch {
      forgetViewer(slug);
    }
  }, [slug]);

  // As respostas da equipa de suporte chegam por sondagem: de 30 em 30 segundos e, nos dois minutos
  // a seguir a escrever (quando a resposta é esperada), de 5 em 5. Antes eram 12 pedidos por minuto a
  // cada pessoa na sala, mesmo sem conversa.
  const lastSentRef = useRef(0);
  const {
    data: privateThread,
    refetch: refetchThread,
    error: threadError,
  } = useQuery({
    queryKey: ["public-room-messages", viewer?.token],
    enabled: Boolean(viewer?.token),
    refetchInterval: () => (Date.now() - lastSentRef.current < 120_000 ? 5000 : 30_000),
    queryFn: () => fetchMessages({ data: { token: viewer!.token } }),
  });
  // Credencial recusada pelo servidor: volta ao formulário em vez de falhar de 5 em 5 segundos.
  useEffect(() => {
    if (threadError?.message !== VIEWER_EXPIRED) return;
    forgetViewer(slug);
    setViewer(null);
  }, [threadError, slug]);

  // Instante real desta pessoa no vídeo: o assistente nunca pode revelar
  // conteúdo que ela ainda não viu, mesmo num replay.
  const positionRef = useRef(0);
  // Última posição guardada desta pessoa no vídeo (usada sem sincronização).
  const [resumeSeconds, setResumeSeconds] = useState<number | null>(null);
  // Ponto mais avançado já visto: os eventos já entregues não voltam a repetir-se.
  const [resumePeakSeconds, setResumePeakSeconds] = useState<number | null>(null);
  const savedPositionRef = useRef(0);
  const peakPositionRef = useRef(0);

  const onSend = useCallback(
    async (body: string) => {
      if (!viewer) return;
      await sendMessage({
        data: {
          token: viewer.token,
          body,
          sessionSeconds: Math.max(0, Math.round(positionRef.current)),
        },
      });
      lastSentRef.current = Date.now();
      void refetchThread();
    },
    [sendMessage, viewer, refetchThread],
  );

  // Ver e clicar na oferta são os sinais comerciais da sala: uma falha passageira repete-se.
  // ponytail: sem chave de idempotência, um pedido que chegou mas cuja resposta se perdeu fica
  // repetido; com a fila de envio no browser entra um id gerado aqui.
  const sendCta = useCallback(
    (eventType: "view" | "click") => {
      if (!viewer) return;
      const data = {
        token: viewer.token,
        eventType,
        videoSecond: Math.max(0, Math.round(positionRef.current)),
      };
      void retry(() => trackCta({ data })).catch((error: unknown) =>
        console.error(`[oferta] ${eventType} não registado`, error),
      );
    },
    [trackCta, viewer],
  );

  // Entrar no grupo da oferta: os dados confirmados ficam na participação e contam como clique.
  const sendGroupJoin = useCallback(
    (person: { name: string; email: string; phone: string }) => {
      if (!viewer) return;
      const data = {
        token: viewer.token,
        name: person.name,
        ...(person.email ? { email: person.email } : {}),
        ...(person.phone ? { phone: person.phone } : {}),
        videoSecond: Math.max(0, Math.round(positionRef.current)),
      };
      void retry(() => joinGroup({ data })).catch((error: unknown) =>
        console.error("[oferta] grupo não registado", error),
      );
    },
    [joinGroup, viewer],
  );

  // Acesso facilitado: entram logo na sala, sem formulário. A sala de teste
  // comporta-se exatamente como a real, por isso segue a configuração pública.
  // A equipa nunca se inscreve: não conta na audiência.
  const easyAccess = Boolean(data?.webinar.easy_access);
  const shouldAutoJoin = easyAccess && !equipa;
  const autoJoinRef = useRef(false);
  useEffect(() => {
    if (!data || !shouldAutoJoin || viewer || autoJoinRef.current) return;
    if (data.webinar.status === "draft" && !testMode) return;
    autoJoinRef.current = true;
    void (async () => {
      try {
        const result = await join({
          data: {
            webinarId: data.webinar.id,
            name: "Convidado",
            email: `convidado-${Date.now()}@sala.local`,
            mode: roomMode,
            teste: testMode,
            ...audienceMeta(),
          },
        });
        const next = { token: result.token, name: result.name };
        rememberViewer(slug, next);
        setViewer(next);
      } catch {
        autoJoinRef.current = false;
      }
    })();
  }, [data, shouldAutoJoin, viewer, join, roomMode, slug, testMode, audienceMeta]);

  const lastSentPeakRef = useRef(0);
  // Segundos vistos que ainda não chegaram ao servidor: se um envio falha, seguem no próximo.
  const pendingPlayedRef = useRef(0);
  const pendingHeartsRef = useRef(0);
  const onProgress = useCallback(
    (seconds: number, peakSeconds?: number, options?: RoomProgressOptions) => {
      positionRef.current = seconds;
      const peak = Math.max(peakSeconds ?? seconds, peakPositionRef.current);
      peakPositionRef.current = peak;
      // Guarda a posição a cada 5 segundos para o vídeo retomar onde parou.
      if (Math.abs(seconds - savedPositionRef.current) >= 5) {
        savedPositionRef.current = seconds;
        setResumeSeconds(seconds);
        try {
          const stored = window.localStorage.getItem(storageKey(slug));
          if (stored) {
            const parsed = JSON.parse(stored) as Viewer;
            if (parsed?.token) {
              window.localStorage.setItem(
                storageKey(slug),
                JSON.stringify({ ...parsed, position: seconds, maxPosition: peak }),
              );
            }
          }
        } catch {
          // Sem posição guardada, o vídeo simplesmente recomeça do início.
        }
      }
      if (!viewer) return;
      // Ao esconder ou fechar a página, keepalive deixa o pedido terminar sem bloquear.
      const keepalive: typeof fetch = (input, init) => fetch(input, { ...init, keepalive: true });
      // Os corações juntos desde o último sinal: um registo para o Painel (se falhar, seguem no próximo).
      pendingHeartsRef.current += options?.hearts ?? 0;
      const hearts = Math.min(pendingHeartsRef.current, 500);
      if (hearts > 0) {
        pendingHeartsRef.current -= hearts;
        const heartsData = {
          token: viewer.token,
          count: hearts,
          videoSecond: Math.max(0, Math.round(seconds)),
        };
        void saveHearts(
          options?.final ? { data: heartsData, fetch: keepalive } : { data: heartsData },
        ).catch(() => {
          pendingHeartsRef.current += hearts;
        });
      }
      pendingPlayedRef.current += options?.played ?? 0;
      // O servidor soma no máximo 120 s por sinal; o resto segue no próximo.
      const played = Math.min(pendingPlayedRef.current, 120);
      // Só grava quando o pico avançou ou houve tempo visto, para não repetir pedidos iguais.
      if (peak <= lastSentPeakRef.current && played === 0) return;
      const previous = lastSentPeakRef.current;
      lastSentPeakRef.current = Math.max(previous, peak);
      pendingPlayedRef.current -= played;
      const data = {
        token: viewer.token,
        watchedSeconds: peak,
        ...(options?.entry != null ? { entrySeconds: options.entry } : {}),
        playedSeconds: played,
      };
      void trackProgress(options?.final ? { data, fetch: keepalive } : { data }).catch(() => {
        if (lastSentPeakRef.current === peak) lastSentPeakRef.current = previous;
        pendingPlayedRef.current += played;
      });
    },
    [trackProgress, saveHearts, viewer, slug],
  );

  if (!hydrated || isLoading) return <RoomSkeleton theme={skeletonTheme} />;
  // Quem já entrou: espera-se pela sessão dela antes de desenhar (sem mostrar a espera ou o «ao vivo» errado).
  if (viewerState.isLoading) return <RoomSkeleton theme={skeletonTheme} />;

  if (!data)
    return (
      <main className="room-ambient flex min-h-dvh items-center justify-center px-6 text-center text-sm text-room-subtle">
        {isError
          ? "Não foi possível carregar a sessão. Estamos a tentar de novo…"
          : "Não encontrámos nenhuma sessão com este endereço."}
      </main>
    );

  const { webinar, comments, audience, socialProof, simulatedPurchases, captions } = data;
  const themeClass = theme === "light" ? "room-light" : "";
  const fields = parseEntryFields(webinar.entry_fields, {
    collectPhone: webinar.registration_collect_phone,
    requirePhone: webinar.registration_require_phone,
  });
  const offerClosedByDeadline = offerDeadlinePassed(
    webinar.offer_deadline,
    webinar.timezone,
    Date.now(),
  );

  const startMs =
    plan.kind === "session"
      ? plan.startMs
      : webinar.session_start
        ? new Date(webinar.session_start).getTime()
        : null;
  // Com o temporizador de arranque ligado, a sala abre antes da hora: as pessoas
  // entram, o chat funciona e o lugar do vídeo mostra a contagem animada.
  const countdown = roomCountdown(webinar.live.countdown, webinar);
  // A contagem corre desde que a sala abre (antes da hora) até ao arranque do vídeo, que pode ficar uns
  // minutos depois da hora marcada: quem chega à hora ainda vê o relógio, e quem se atrasa apanha o início.
  const delayMs = countdown.afterSeconds * 1000;
  const preliveSeconds = countdown.seconds + countdown.afterSeconds;
  const roomOpensMs = startMs === null ? null : startMs - countdown.seconds * 1000;
  const inWaitingRoom =
    roomMode === "live" &&
    !testMode &&
    webinar.waiting_room_enabled &&
    // Quem já tem a sessão acabada (replay, terminou, comprou) não espera pela próxima sessão do webinar.
    (plan.kind === "session" || (plan.kind === "global" && webinar.waiting_open !== false)) &&
    roomOpensMs !== null &&
    roomOpensMs > Date.now() &&
    waiting;

  // A sessão do dia terminou e a próxima é noutro dia: mostramos o fim da
  // transmissão. A sala de espera só volta a abrir no dia da sessão seguinte.
  // A sala de teste nunca mostra este ecrã — entra sempre.
  const sessionClosed =
    plan.kind === "global" &&
    roomMode === "live" &&
    !testMode &&
    Boolean(webinar.session_ended) &&
    webinar.waiting_open === false &&
    startMs !== null &&
    startMs > Date.now();

  // A equipa entra sempre (antes da hora, em rascunho, depois do fim): não passa pelo formulário nem conta.
  if (equipa && (teamToken === "checking" || teamToken === "denied" || teamToken === null))
    return (
      <TeamNotice
        theme={theme}
        state={teamToken === "denied" ? "denied" : "checking"}
        loginHref={equipa === "1" ? "/auth/login" : undefined}
      />
    );
  if (equipa && !member)
    return (
      <TeamEntry
        title={webinar.public_title}
        hostName={webinar.host_name}
        theme={theme}
        initial={savedMember}
        onEnter={(next) => {
          setMember(next);
          try {
            window.localStorage.setItem(memberKey, JSON.stringify(next));
          } catch {
            /* fica só nesta visita */
          }
        }}
      />
    );
  const asTeam = equipa && member ? member : null;

  if (inWaitingRoom && !asTeam)
    return (
      <WaitingScreen
        title={webinar.public_title}
        startMs={startMs ?? roomOpensMs}
        opensMs={roomOpensMs}
        timezone={webinar.timezone}
        themeClass={themeClass}
        style={countdown.style}
        color={countdown.color}
        onZero={() => setWaiting(false)}
        video={webinar.waiting_video}
        countdownBackground={{ image: countdown.background.image, video: webinar.countdown_video }}
        showCountdown={webinar.live.waiting.countdown}
        groupUrl={(webinar as { group_url?: string | null }).group_url}
      />
    );

  if (sessionClosed && !asTeam)
    return (
      <main
        className={`room-ambient flex min-h-dvh items-center justify-center px-6 text-center ${themeClass}`}
      >
        <div className="max-w-md space-y-4">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-room-subtle">
            Transmissão terminou
          </p>
          <h1 className="text-2xl font-black text-room-text sm:text-3xl">{webinar.public_title}</h1>
          <p className="text-sm leading-relaxed text-room-subtle">
            A sessão de hoje chegou ao fim. A sala de espera volta a abrir no dia da próxima sessão:{" "}
            <span className="font-semibold text-room-text">
              {formatSessionStart(startMs, webinar.timezone)}
            </span>
            . Guarde este endereço — é sempre o mesmo.
          </p>
        </div>
      </main>
    );

  // A sessão desta pessoa já acabou e ela já comprou: tem acesso, não volta a ver a venda.
  if (plan.kind === "bought")
    return (
      <main
        className={`room-ambient flex min-h-dvh items-center justify-center px-6 text-center ${themeClass}`}
      >
        <div className="max-w-sm space-y-3">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-room-subtle">
            Compra confirmada
          </p>
          <h1 className="text-2xl font-black text-room-text">Já tem acesso</h1>
          <p className="text-sm leading-relaxed text-room-subtle">
            A sua compra de «{webinar.public_title}» está confirmada. Use o acesso que recebeu
            depois do pagamento; se não o encontrar, procure no e-mail que usou na compra.
          </p>
        </div>
      </main>
    );

  // A sessão desta pessoa já acabou e o webinar não tem replay: terminou para ela (sem a convidar para «a
  // próxima» como se fosse nova; o mesmo «ao vivo» não volta a passar-lhe).
  if (plan.kind === "ended")
    return (
      <main
        className={`room-ambient flex min-h-dvh items-center justify-center px-6 text-center ${themeClass}`}
      >
        <div className="max-w-md space-y-4">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-room-subtle">
            Transmissão terminou
          </p>
          <h1 className="text-2xl font-black text-room-text sm:text-3xl">{webinar.public_title}</h1>
          <p className="text-sm leading-relaxed text-room-subtle">
            A sua sessão ({formatSessionStart(plan.startMs, webinar.timezone)}) já terminou e esta
            aula não fica gravada.
          </p>
        </div>
      </main>
    );

  // A sessão desta pessoa acabou e há replay: retoma onde ficou, como gravação.
  const effectiveMode = plan.kind === "replay" ? "replay" : roomMode;

  // O prazo da oferta fecha também o replay.
  if (effectiveMode === "replay" && offerClosedByDeadline && !testMode)
    return (
      <main
        className={`room-ambient flex min-h-dvh items-center justify-center px-6 text-center ${themeClass}`}
      >
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-black text-room-text">O replay terminou</h1>
          <p className="text-sm text-room-subtle">
            Esta gravação esteve disponível até ao fim do prazo da oferta.
          </p>
        </div>
      </main>
    );

  if (webinar.status === "draft" && !testMode && !asTeam)
    return (
      <main
        className={`room-ambient flex min-h-dvh items-center justify-center px-6 text-center ${themeClass}`}
      >
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-black text-room-text">Sessão indisponível</h1>
          <p className="text-sm text-room-subtle">
            Esta sala está inativa de momento. Quando o anfitrião a ativar, pode entrar pelo mesmo
            endereço.
          </p>
        </div>
      </main>
    );

  if (!viewer && shouldAutoJoin && !asTeam)
    return (
      <main
        className={`room-ambient flex min-h-dvh items-center justify-center text-sm text-room-subtle ${themeClass}`}
      >
        A entrar na sala...
      </main>
    );

  if (!viewer && !asTeam) {
    const submit = async () => {
      setError("");
      setErrorField(undefined);
      const checked = validateEntry(fields, values);
      if (!checked.ok) {
        setError(checked.message);
        setErrorField(checked.field);
        return;
      }
      // O número vai sempre com o indicativo do país escolhido (ex.: +244 923...).
      const phone = checked.phone ? `${phoneCountry.dial} ${checked.phone}` : undefined;
      setEntering(true);
      try {
        const result = await join({
          data: {
            webinarId: webinar.id,
            name: checked.name,
            ...(checked.email ? { email: checked.email } : {}),
            ...(phone ? { phone } : {}),
            ...(Object.keys(checked.answers).length ? { answers: checked.answers } : {}),
            mode: roomMode,
            teste: testMode,
            ...(values["website"] ? { website: values["website"] } : {}),
            ...audienceMeta(),
          },
        });
        const next = { token: result.token, name: result.name };
        rememberViewer(slug, next);
        if (!testMode) trackPixels("lead");
        setViewer(next);
      } catch (cause) {
        const message = cause instanceof Error && cause.message.length < 120 ? cause.message : "";
        setError(
          message && !/indispon/i.test(message)
            ? message
            : "Não foi possível entrar agora. Tente novamente.",
        );
      } finally {
        setEntering(false);
      }
    };

    // A página: o título com «Ao vivo», os campos e o botão. Quem preenche entra logo na sala.
    const live = entryLiveLabel(startMs, webinar.timezone, Date.now());
    const elapsed = startMs !== null && startMs <= Date.now() ? (Date.now() - startMs) / 1000 : 0;
    return (
      <EntryScreen
        className="min-h-dvh"
        theme={theme}
        title={webinar.public_title}
        live={live.live}
        liveLabel={live.label}
        // O vídeo desfocado por trás do formulário é enfeite: a poupar dados, fica o fundo liso (nada descarrega).
        // O vídeo desfocado por trás do formulário é enfeite: só no computador. No telemóvel (dados móveis,
        // aparelhos fracos) fica o fundo liso: a aula inteira começava a descarregar antes de a pessoa se inscrever.
        video={
          !saveData &&
          typeof window !== "undefined" &&
          window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches &&
          isDirectVideo(webinar.video_url, webinar.video_provider)
            ? { url: webinar.video_url!, startSeconds: elapsed }
            : null
        }
        buttonText={webinar.registration_button_text || "Entrar na sala"}
        notice={entryNotice(webinar)}
        coverUrl={webinar.registration_cover_url || null}
        fields={fields}
        values={values}
        onChange={setValues}
        country={phoneCountry}
        onCountry={setPhoneCountry}
        cardColor={webinar.entry_card_color}
        buttonColor={webinar.entry_button_color}
        onSubmit={() => void submit()}
        error={error}
        errorField={errorField}
        entering={entering}
      />
    );
  }

  // Sala de teste: entra sempre, a qualquer hora — sem sala de espera, sem
  // contagem de prelive e sem depender da hora marcada. O vídeo arranca sempre
  // do início (nunca retoma onde ficou: quem viu até ao fim abria em «Transmissão
  // terminou») e todo o conteúdo segue o relógio do vídeo, como num replay ao vivo.
  // Quem regressa segue a sua sessão (`plan`); no replay depois da sessão, retoma onde ficou (neste aparelho,
  // ou até onde viu noutro).
  const roomStartsAt =
    testMode || plan.kind === "replay"
      ? null
      : plan.kind === "session"
        ? new Date(plan.startMs + delayMs).toISOString()
        : webinar.session_start
          ? new Date(new Date(webinar.session_start).getTime() + delayMs).toISOString()
          : webinar.session_start;
  const syncWithStart = testMode || plan.kind === "replay" ? false : webinar.sync_video_with_start;
  const effectivePreliveSeconds = testMode || plan.kind === "replay" ? 0 : preliveSeconds;
  const resumeAt = testMode
    ? null
    : plan.kind === "replay"
      ? (resumeSeconds ?? plan.resumeSeconds)
      : resumeSeconds;
  const resumePeak = testMode
    ? null
    : plan.kind === "replay"
      ? Math.max(resumePeakSeconds ?? 0, plan.resumeSeconds)
      : resumePeakSeconds;

  return (
    <WebinarRoom
      theme={theme}
      appearance={appearance}
      onAppearance={chooseAppearance}
      captions={captions}
      offers={{
        extra: parseExtraOffers(webinar.extra_offers),
        closed: offerClosedByDeadline,
        closeAtZero: webinar.offer_countdown_end === "close",
        utm: webinar.offer_utm,
        timezone: webinar.timezone,
      }}
      sales={{
        where:
          webinar.sales_where === "chat" || webinar.sales_where === "video"
            ? webinar.sales_where
            : "both",
        real: webinar.sales_show_real,
      }}
      audienceFormat={audience.format}
      hostVerified={webinar.host_verified}
      format={webinar.room_format}
      live={webinar.live}
      onJoinGroup={sendGroupJoin}
      prefill={{
        name: values["name"] ?? "",
        email: values["email"] ?? "",
        phone: values["whatsapp"] ? `${phoneCountry.dial} ${values["whatsapp"]}` : "",
      }}
      mode={effectiveMode}
      // Só na sala de teste: a barra para avançar, recuar e pausar o vídeo (ver a sala do início ao fim).
      testControls={testMode}
      startsAt={roomStartsAt}
      viewerName={asTeam?.name ?? viewer?.name ?? ""}
      // A equipa não entra na presença: não conta na Vista ao vivo.
      organizationId={asTeam ? null : webinar.organization_id}
      team={asTeam}
      teamMessages={teamChat.messages}
      comments={comments}
      audienceMode={audience.mode}
      curve={audience.curve}
      socialProof={socialProof}
      purchases={simulatedPurchases}
      syncWithStart={syncWithStart}
      resumeSeconds={syncWithStart ? null : resumeAt}
      resumePeakSeconds={resumePeak}
      preliveSeconds={effectivePreliveSeconds}
      preliveSound={countdown.sound}
      preliveMessage={preliveTitle(webinar.prelive_message)}
      preliveTemplate={countdown.style}
      preliveAppearance={webinar.prelive_appearance}
      preliveColor={countdown.color}
      preliveBackground={{ image: countdown.background.image, video: webinar.countdown_video }}
      onSend={asTeam ? teamChat.send : onSend}
      supportMessages={asTeam ? [] : (privateThread?.messages ?? [])}
      onProgress={asTeam ? undefined : onProgress}
      checkoutOrigin={{
        source: source["utm_source"] ?? null,
        medium: source["utm_medium"] ?? null,
        campaign: source["utm_campaign"] ?? null,
      }}
      // A equipa não conta nas métricas da oferta.
      onCtaView={asTeam ? undefined : () => sendCta("view")}
      onCtaClick={
        asTeam
          ? undefined
          : () => {
              if (!testMode) trackPixels("checkout");
              sendCta("click");
            }
      }
      webinar={{
        id: webinar.id,
        public_title: webinar.public_title,
        description: webinar.description,
        host_name: webinar.host_name,
        host_role: webinar.host_role,
        host_avatar_url: webinar.host_avatar_url,
        chat_pin_title: webinar.chat_pin_title,
        chat_pin_message: webinar.chat_pin_message,
        offer_pin_title: webinar.offer_pin_title,
        offer_pin_message: webinar.offer_pin_message,
        cta_text: webinar.cta_text,
        cta_url: webinar.cta_url,
        cta_color: webinar.cta_color,
        cta_price_original: webinar.cta_price_original,
        cta_price_now: webinar.cta_price_now,
        cta_image_url: webinar.cta_image_url,
        cta_countdown_seconds: webinar.cta_countdown_seconds,
        cta_start_seconds: webinar.cta_start_seconds,
        cta_end_seconds: webinar.cta_end_seconds,
        video_url: webinar.video_url,
        video_provider: webinar.video_provider,
        duration_seconds: webinar.duration_seconds,
        // O convite do grupo do fluxo (vem do servidor; leitura opcional até todas as versões o trazerem).
        group_url: (webinar as { group_url?: string | null }).group_url ?? null,
      }}
    />
  );
}
