import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Presença e reações em tempo real.
 * Nada disto passa pela base de dados: usa os canais em tempo real, por isso
 * é leve e desaparece quando a pessoa fecha o separador.
 */

export type LiveViewer = {
  key: string;
  webinarId: string;
  webinarTitle: string;
  name: string;
  mode: "live" | "replay";
  /** A Vista ao vivo separa telemóvel e computador: o tablet conta como telemóvel (como sempre contou). */
  device: "mobile" | "desktop";
  city: string | null;
  country: string | null;
  countryCode: string | null;
  lat: number | null;
  lon: number | null;
  checkout: boolean;
  /** Com a oferta no ecrã; null quando a sala não o diz. */
  offer: boolean | null;
  joinedAt: string;
};

export type DeviceKind = "mobile" | "tablet" | "desktop";

/**
 * O aparelho pelo browser: tablet (iPad, incluindo o iPadOS que se diz Mac mas tem toque; Android sem
 * «Mobile»; Kindle), telemóvel ou computador. `coarseSmall`: ecrã de toque com menos de 1024 px.
 */
export function deviceOf(userAgent: string, touchPoints = 0, coarseSmall = false): DeviceKind {
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(userAgent)) return "tablet";
  if (/Macintosh/i.test(userAgent) && touchPoints > 1) return "tablet";
  if (/Android/i.test(userAgent) && !/Mobi/i.test(userAgent)) return "tablet";
  if (/Mobi|Android|iPhone|iPod|IEMobile/i.test(userAgent)) return "mobile";
  return coarseSmall ? "mobile" : "desktop";
}

/** Deteta se a pessoa está num telemóvel, num tablet ou num computador. */
export function detectDevice(): DeviceKind {
  if (typeof navigator === "undefined") return "desktop";
  const coarseSmall =
    typeof window !== "undefined" && Boolean(window.matchMedia?.("(pointer: coarse)").matches) && window.innerWidth < 1024;
  return deviceOf(navigator.userAgent, navigator.maxTouchPoints ?? 0, coarseSmall);
}

export type GeoPlace = {
  city: string | null;
  country: string | null;
  /** Código ISO de duas letras (ex.: "PT") — serve para pré-selecionar o indicativo do WhatsApp. */
  countryCode: string | null;
  lat: number | null;
  lon: number | null;
};

const GEO_KEY = "novawebinar:geo";
const GEO_TTL_MS = 6 * 60 * 60 * 1000;

type GeoProbe = { url: string; read: (body: Record<string, unknown>) => GeoPlace };

const num = (value: unknown) => (typeof value === "number" ? value : Number(value)) || null;
const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

// Vários serviços: se o primeiro devolver a cidade do operador em vez da real,
// tentamos o seguinte. A localização por endereço de rede é sempre aproximada.
const probes: GeoProbe[] = [
  {
    url: "https://ipwho.is/",
    read: (b) => ({
      city: str(b["city"]),
      country: str(b["country"]),
      countryCode: str(b["country_code"]),
      lat: num(b["latitude"]),
      lon: num(b["longitude"]),
    }),
  },
  {
    url: "https://ipapi.co/json/",
    read: (b) => ({
      city: str(b["city"]),
      country: str(b["country_name"]),
      countryCode: str(b["country_code"]),
      lat: num(b["latitude"]),
      lon: num(b["longitude"]),
    }),
  },
  {
    url: "https://get.geojs.io/v1/ip/geo.json",
    read: (b) => ({
      city: str(b["city"]),
      country: str(b["country"]),
      countryCode: str(b["country_code"]),
      lat: num(b["latitude"]),
      lon: num(b["longitude"]),
    }),
  },
];

/** Descobre onde está quem vê a partir do endereço de rede.
 *  Não pedimos autorização de localização: usamos apenas probes de IP,
 *  que são aproximadas mas evitam o pedido de permissão no ecrã.
 */
export async function lookupPlace(): Promise<GeoPlace> {
  const empty: GeoPlace = { city: null, country: null, countryCode: null, lat: null, lon: null };
  try {
    const cached = window.localStorage.getItem(GEO_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as GeoPlace & { savedAt?: number };
      if (parsed.savedAt && Date.now() - parsed.savedAt < GEO_TTL_MS) {
        return {
          city: parsed.city,
          country: parsed.country,
          countryCode: parsed.countryCode ?? null,
          lat: parsed.lat,
          lon: parsed.lon,
        };
      }
      window.localStorage.removeItem(GEO_KEY);
    }
  } catch {
    /* ignora */
  }

  for (const probe of probes) {
    try {
      const response = await fetch(probe.url);
      if (!response.ok) continue;
      const place = probe.read((await response.json()) as Record<string, unknown>);
      if (!place.city && !place.country) continue;
      try {
        window.localStorage.setItem(GEO_KEY, JSON.stringify({ ...place, savedAt: Date.now() }));
      } catch {
        /* ignora */
      }
      return place;
    } catch {
      /* tenta o serviço seguinte */
    }
  }
  return empty;
}

export function presenceChannelName(organizationId: string) {
  return `live-view:${organizationId}`;
}

/**
 * A identidade desta pessoa no canal, guardada no separador: um recarregamento (o Safari no telemóvel
 * fá-lo por falta de memória) mantém a mesma chave e a mesma hora de entrada, em vez de aparecer na
 * Vista ao vivo como uma entrada nova. Sem armazenamento, vale só esta abertura.
 */
export function presenceIdentity(webinarId: string, nowIso = new Date().toISOString()) {
  const storageKey = `novawebinar:presence:${webinarId}`;
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored) as { key?: unknown; joinedAt?: unknown };
      if (typeof parsed.key === "string" && parsed.key.startsWith(`${webinarId}:`) && typeof parsed.joinedAt === "string") {
        return { key: parsed.key, joinedAt: parsed.joinedAt };
      }
    }
  } catch {
    /* sem armazenamento */
  }
  const identity = { key: `${webinarId}:${Math.random().toString(36).slice(2)}`, joinedAt: nowIso };
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(identity));
  } catch {
    /* sem armazenamento */
  }
  return identity;
}

/** Quanto tempo a Vista ao vivo segura uma pessoa depois de a ligação dela cair. */
export const PRESENCE_GRACE_MS = 30_000;

/**
 * A lista a mostrar: quem está mesmo no canal mais quem saiu há menos de `graceMs` (o telemóvel
 * perde a ligação ao bloquear o ecrã ou ao mudar de app e volta segundos depois; sem isto a pessoa
 * «entrava e saía» a cada queda). `lingering` é o que ficou da leitura anterior; devolve o novo.
 */
export function withLingering(
  current: LiveViewer[],
  previous: LiveViewer[],
  lingering: Map<string, { viewer: LiveViewer; until: number }>,
  nowMs: number,
  graceMs = PRESENCE_GRACE_MS,
) {
  const present = new Set(current.map((v) => v.key));
  const next = new Map<string, { viewer: LiveViewer; until: number }>();
  for (const [key, entry] of lingering) {
    if (!present.has(key) && entry.until > nowMs) next.set(key, entry);
  }
  // Só quem estava mesmo no canal começa a esperar; quem já esperava e expirou sai de vez.
  for (const viewer of previous) {
    if (!present.has(viewer.key) && !lingering.has(viewer.key)) {
      next.set(viewer.key, { viewer, until: nowMs + graceMs });
    }
  }
  return { viewers: [...current, ...[...next.values()].map((entry) => entry.viewer)], lingering: next };
}

/**
 * O canal de presença é público: qualquer pessoa com o id da conta o pode ouvir. Por isso
 * vai só o primeiro nome e a inicial («Ana C.») e o sítio arredondado ao da cidade (~11 km).
 * ponytail: mitigação; o canal privado precisa de políticas em realtime.messages e de
 * desligar «Allow public access» no Realtime, o que corta os outros canais públicos.
 */
export function publicName(full: string) {
  const [first = "", ...rest] = full.trim().split(/\s+/);
  const last = rest.at(-1);
  return `${first.split("@")[0]}${last ? ` ${last[0]!.toUpperCase()}.` : ""}`;
}

export function publicPlace(place: GeoPlace): GeoPlace {
  const round = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);
  return { ...place, lat: round(place.lat), lon: round(place.lon) };
}

/**
 * Marca esta pessoa como presente na sala e avisa quando clica na oferta. `offerOpen`
 * (opcional) diz se a oferta está no ecrã, para a Vista ao vivo contar «Na oferta».
 */
export function useLivePresence({
  organizationId,
  webinarId,
  webinarTitle,
  name,
  mode,
  checkout,
  offerOpen,
}: {
  organizationId: string | null | undefined;
  webinarId: string;
  webinarTitle: string;
  name: string;
  mode: "live" | "replay";
  checkout: boolean;
  offerOpen?: boolean;
}) {
  const stateRef = useRef({ checkout, offerOpen });
  stateRef.current = { checkout, offerOpen };
  const tracked = useRef<{ channel: ReturnType<typeof supabase.channel>; payload: Record<string, unknown> } | null>(null);

  useEffect(() => {
    if (!organizationId) return;
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    void (async () => {
      const place = await lookupPlace();
      if (!active) return;
      const identity = presenceIdentity(webinarId);
      channel = supabase.channel(presenceChannelName(organizationId), {
        config: { presence: { key: identity.key } },
      });
      const payload = {
        webinarId,
        webinarTitle,
        name: publicName(name),
        mode,
        device: detectDevice(),
        joinedAt: identity.joinedAt,
        ...publicPlace(place),
      };
      channel.subscribe((status) => {
        if (status !== "SUBSCRIBED" || !channel) return;
        tracked.current = { channel, payload };
        const { checkout: clicked, offerOpen: offer } = stateRef.current;
        void channel.track({ ...payload, checkout: clicked, ...(offer === undefined ? {} : { offer }) });
      });
    })();

    return () => {
      active = false;
      tracked.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [organizationId, webinarId, webinarTitle, name, mode]);

  // Quando a pessoa clica em comprar ou a oferta abre/fecha, a presença é atualizada na hora.
  useEffect(() => {
    const current = tracked.current;
    if (!current) return;
    void current.channel.track({
      ...current.payload,
      checkout,
      ...(offerOpen === undefined ? {} : { offer: offerOpen }),
    });
  }, [checkout, offerOpen]);
}

/** Lista, em tempo real, quem está agora dentro das salas do workspace. */
export function useLiveViewers(organizationId: string | null | undefined) {
  const [viewers, setViewers] = useState<LiveViewer[]>([]);
  const shownRef = useRef<LiveViewer[]>([]);
  const lingeringRef = useRef(new Map<string, { viewer: LiveViewer; until: number }>());

  useEffect(() => {
    if (!organizationId) return;
    const channel = supabase.channel(presenceChannelName(organizationId), {
      config: { presence: { key: `painel:${Math.random().toString(36).slice(2)}` } },
    });
    let expiry: number | null = null;

    const read = () => {
      const state = channel.presenceState<Record<string, unknown>>();
      const rows: LiveViewer[] = [];
      for (const [key, entries] of Object.entries(state)) {
        if (key.startsWith("painel:")) continue;
        const entry = entries[0] as Record<string, unknown> | undefined;
        if (!entry || typeof entry["webinarId"] !== "string") continue;
        rows.push({
          key,
          webinarId: entry["webinarId"] as string,
          webinarTitle: (entry["webinarTitle"] as string) ?? "Sessão",
          name: (entry["name"] as string) || "Participante",
          mode: entry["mode"] === "replay" ? "replay" : "live",
          device: entry["device"] === "mobile" || entry["device"] === "tablet" ? "mobile" : "desktop",
          city: (entry["city"] as string) ?? null,
          country: (entry["country"] as string) ?? null,
          countryCode: typeof entry["countryCode"] === "string" ? (entry["countryCode"] as string) : null,
          lat: typeof entry["lat"] === "number" ? (entry["lat"] as number) : null,
          lon: typeof entry["lon"] === "number" ? (entry["lon"] as number) : null,
          checkout: entry["checkout"] === true,
          offer: typeof entry["offer"] === "boolean" ? (entry["offer"] as boolean) : null,
          joinedAt: (entry["joinedAt"] as string) ?? new Date().toISOString(),
        });
      }
      // Quem acabou de cair fica mais uns segundos; volta a ler-se quando o primeiro expirar.
      const now = Date.now();
      const merged = withLingering(rows, shownRef.current, lingeringRef.current, now);
      shownRef.current = merged.viewers;
      lingeringRef.current = merged.lingering;
      setViewers(merged.viewers);
      if (expiry !== null) window.clearTimeout(expiry);
      expiry = null;
      const soonest = Math.min(...[...merged.lingering.values()].map((entry) => entry.until));
      if (Number.isFinite(soonest)) expiry = window.setTimeout(read, Math.max(250, soonest - now + 50));
    };

    channel
      .on("presence", { event: "sync" }, read)
      .on("presence", { event: "join" }, read)
      .on("presence", { event: "leave" }, read)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ role: "painel" });
      });

    return () => {
      if (expiry !== null) window.clearTimeout(expiry);
      shownRef.current = [];
      lingeringRef.current = new Map();
      void supabase.removeChannel(channel);
    };
  }, [organizationId]);

  return viewers;
}

export type Heart = { id: number; offset: number };

/** Corações enviados por quem está na sala, partilhados com toda a gente. */
export function useHearts(webinarId: string) {
  const [hearts, setHearts] = useState<Heart[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const counter = useRef(0);

  const push = useCallback(() => {
    counter.current += 1;
    const heart: Heart = { id: counter.current, offset: Math.random() * 60 - 30 };
    setHearts((prev) => [...prev.slice(-24), heart]);
    window.setTimeout(() => setHearts((prev) => prev.filter((h) => h.id !== heart.id)), 2600);
  }, []);

  useEffect(() => {
    const channel = supabase.channel(`hearts:${webinarId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "heart" }, () => push()).subscribe();
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [webinarId, push]);

  const sendHeart = useCallback(() => {
    push();
    void channelRef.current?.send({
      type: "broadcast",
      event: "heart",
      payload: { at: Date.now() },
    });
  }, [push]);

  return useMemo(() => ({ hearts, sendHeart }), [hearts, sendHeart]);
}
