import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AiJobsOverview, SyncJobsOverview } from "@/components/ai-job-banner";
import { AppShell } from "@/components/app-shell";
import {
  DashboardView,
  type HeroData,
  type RecentWebinar,
  type Results,
} from "@/components/dashboard/painel";
import { supabase } from "@/integrations/supabase/client";
import { monthEntries, scheduleSummary } from "@/lib/agenda";
import {
  countryMix,
  deviceMix,
  entriesBetween,
  fromNow,
  funnelSteps,
  heroIssues,
  periodStart,
  pickHero,
  todaySummary,
  whenLabel,
  type Period,
} from "@/lib/dashboard";
import {
  lifecycleOf,
  publicOrigin,
  useWebinarAutomations,
  useWebinars,
  useWorkspace,
  type Webinar,
} from "@/lib/data";
import { fetchAll } from "@/lib/fetch-all";
import { HEARTS_EVENT } from "@/lib/room-reactions.functions";
import { useLiveViewers } from "@/lib/live-presence";
import { nowCount, useRoomNow } from "@/lib/room-now";
import { FACT_COLUMNS, funnelSummary } from "@/lib/participant-facts";
import { lifecycleLabel, type WebinarLifecycle } from "@/lib/schedule";
import { sumByCurrency } from "@/lib/webinar-metrics";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Painel | Novawebinar" },
      {
        name: "description",
        content: "O próximo webinar, os resultados, a agenda e quem esteve na sala hoje.",
      },
      { property: "og:title", content: "Painel | Novawebinar" },
      { property: "og:description", content: "Acompanhe os seus webinars na Novawebinar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

type W = Webinar & {
  video_sources?: { source_url: string | null; duration_seconds: number | null } | null;
};

const titleOf = (w: Pick<Webinar, "public_title" | "internal_name">) =>
  w.public_title || w.internal_name;

/** A capa do webinar ou, sem ela, um fotograma do vídeo a 15% (entre 3 s e 2 min). */
const imageOf = (w: W) => ({
  cover: w.cover_url || w.registration_cover_url || null,
  video: w.video_sources?.source_url ?? null,
  at: Math.min(120, Math.max(3, (w.video_sources?.duration_seconds ?? 0) * 0.15)),
});

const openLabel = (l: WebinarLifecycle) =>
  l.kind === "jit" ? `A cada ${l.intervalMinutes} min` : "Sempre disponível";

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function Dashboard() {
  const { data: workspace } = useWorkspace();
  const orgId = workspace?.organizationId;
  const { data: webinars = [], isLoading } = useWebinars(orgId);
  const [period, setPeriod] = useState<Period>("30d");
  const viewers = useLiveViewers(orgId);
  // A segunda fonte do «na sala agora»: os batimentos que a sala grava (ver room-now.ts).
  const roomNow = useRoomNow(orgId);

  // «Agora» só no browser (no servidor a hora seria outra) e a andar de minuto a minuto.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const dayStart = now === null ? null : startOfDay(now);
  const month = now === null ? null : { year: new Date(now).getFullYear(), month: new Date(now).getMonth() + 1 };

  /* ---------- O que vai em cima e os webinars recentes ---------- */

  const list = webinars as W[];
  const picked = useMemo(
    () => (now === null ? null : pickHero(list.map((w) => ({ webinar: w, lifecycle: lifecycleOf(w, now) })))),
    [list, now],
  );
  // O mesmo pedido (e a mesma cache) que o editor usa para avisar das automações em falta.
  const heroAutomations = useWebinarAutomations(picked?.webinar.id);
  // Os rascunhos ficam na página Webinars.
  const recentList = useMemo(() => list.filter((w) => w.status !== "draft").slice(0, 4), [list]);
  const statIds = useMemo(
    () => [...new Set([picked?.webinar.id, ...recentList.map((w) => w.id)].filter(Boolean) as string[])],
    [picked, recentList],
  );
  const perWebinar = useQuery({
    queryKey: ["dashboard", "webinars", orgId, statIds.join(",")],
    enabled: Boolean(orgId) && statIds.length > 0,
    queryFn: () =>
      fetchAll((from, to) =>
        supabase
          .from("participant_facts")
          .select(`${FACT_COLUMNS}, joined_at`, { count: "exact" })
          .eq("organization_id", orgId!)
          .in("webinar_id", statIds)
          .order("participant_id")
          .range(from, to),
      ),
  });
  const statsOf = (id: string) => {
    if (!perWebinar.data) return null;
    const facts = perWebinar.data.filter((f) => f.webinar_id === id);
    const s = funnelSummary(facts);
    const today = new Set(
      facts.filter((f) => dayStart !== null && f.joined_at && Date.parse(f.joined_at) >= dayStart).map((f) => f.person_id),
    );
    return { registered: s.registered, attended: s.attended, buyers: s.buyers, registeredToday: today.size };
  };

  let hero: HeroData | null = null;
  if (picked && now !== null) {
    const { webinar: w, lifecycle: l, kind } = picked;
    const session = l.kind === "session" ? l : null;
    const when =
      kind === "live" && session
        ? `Começou ${whenLabel(session.startMs, w.timezone, now).replace(/^\S+/, (s) => s.toLowerCase())}`
        : kind === "next" && session
          ? whenLabel(session.startMs, w.timezone, now)
          : null;
    hero = {
      id: w.id,
      slug: w.slug,
      title: titleOf(w),
      kind,
      badge: kind === "open" ? openLabel(l) : undefined,
      when,
      countdown:
        kind === "next" && session
          ? fromNow(session.startMs, now)
          : kind === "live" && session?.endMs
            ? `termina ${fromNow(session.endMs, now)}`
            : null,
      detail:
        kind === "draft"
          ? "Ainda está inactivo: a sala não abre a ninguém. Reveja e active-o no editor."
          : kind === "open"
            ? l.kind === "jit"
              ? `Recomeça a cada ${l.intervalMinutes} minutos para quem chega.`
              : "Cada pessoa vê desde o início, quando entra."
            : session?.state === "finished"
              ? `Terminou ${whenLabel(session.endMs ?? session.startMs, w.timezone, now).replace(/^\S+/, (s) => s.toLowerCase())}. Marque a próxima data.`
              : "Marque a data na etapa Agenda do webinar.",
      image: imageOf(w),
      stats: statsOf(w.id),
      liveNow: nowCount(viewers.filter((v) => v.webinarId === w.id).length, roomNow.byWebinar.get(w.id)?.total ?? 0),
      issues: heroIssues({
        hasVideo: Boolean(w.video_source_id),
        workflows: heroAutomations.data?.workflows.length ?? null,
        lifecycle: l,
      }),
    };
  }

  const recent: RecentWebinar[] | null =
    now === null || isLoading
      ? null
      : recentList.map((w) => {
          const l = lifecycleOf(w, now);
          const tone =
            l.kind === "session"
              ? l.state === "live"
                ? "live"
                : l.state === "scheduled"
                  ? "next"
                  : "muted"
              : "next";
          return {
            id: w.id,
            title: titleOf(w),
            state: l.kind === "session" && l.state === "live" ? "Ao vivo" : l.kind === "on_demand" ? "Sempre disponível" : lifecycleLabel(l),
            tone,
            when: scheduleSummary(w),
            image: imageOf(w),
            stats: statsOf(w.id),
          };
        });

  /* ---------- Resultados do período ---------- */

  const results = useQuery({
    queryKey: ["dashboard", "results", orgId, period],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const start = periodStart(period);
      const since = <T extends { gte: (column: string, value: string) => T }>(q: T, column: string) =>
        start ? q.gte(column, start) : q;
      const [facts, purchases, messages, reactions] = await Promise.all([
        fetchAll((from, to) =>
          since(
            supabase
              .from("participant_facts")
              .select(`${FACT_COLUMNS}, device, country`, { count: "exact" })
              .eq("organization_id", orgId!),
            "joined_at",
          )
            .order("participant_id")
            .range(from, to),
        ),
        fetchAll((from, to) =>
          since(
            supabase
              .from("real_purchase_events")
              .select("amount_value, currency", { count: "exact" })
              .eq("organization_id", orgId!)
              .eq("status", "approved"),
            "approved_at",
          )
            .order("id")
            .range(from, to),
        ),
        // As mensagens que os participantes escreveram na sala.
        since(
          supabase
            .from("event_log")
            .select("name", { count: "exact", head: true })
            .eq("organization_id", orgId!)
            .eq("name", "message_sent"),
          "occurred_at",
        ).then(({ count, error }) => (error ? null : (count ?? 0))),
        // Os corações da sala: um registo por pessoa de 30 em 30 s, com a contagem (room-reactions).
        fetchAll((from, to) =>
          since(
            supabase
              .from("analytics_events")
              .select("count:properties->count", { count: "exact" })
              .eq("organization_id", orgId!)
              .eq("event_name", HEARTS_EVENT)
              .eq("is_real", true),
            "occurred_at",
          )
            .order("id")
            .range(from, to),
        ).then(
          (rows) => rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0),
          () => null,
        ),
      ]);
      return { facts, purchases, messages, reactions, start };
    },
  });

  const view = useMemo(() => {
    if (!results.data) return null;
    const { facts, purchases, messages, reactions, start } = results.data;
    const s = funnelSummary(facts);
    const summary: Results = {
      registered: s.registered,
      attended: s.attended,
      averageWatchSeconds: s.averageWatchSeconds,
      sawOffer: s.sawOffer,
      clicked: s.clicked,
      buyers: s.buyers,
      messages,
      reactions,
      purchases: purchases.length,
      revenue: sumByCurrency(purchases).sort((a, b) => b.amount - a.amount),
      webinarsCreated: list.filter((w) => !start || w.created_at >= start).length,
      webinarsTotal: list.length,
    };
    return {
      summary,
      steps: funnelSteps(s),
      mix: { devices: deviceMix(facts), countries: countryMix(facts) },
    };
  }, [results.data, list]);

  /* ---------- Hoje ---------- */

  const todayIso = dayStart === null ? null : new Date(dayStart).toISOString();
  const today = useQuery({
    queryKey: ["dashboard", "today", orgId, todayIso],
    enabled: Boolean(orgId) && todayIso !== null,
    refetchInterval: 60_000,
    queryFn: () =>
      fetchAll((from, to) =>
        supabase
          .from("participant_facts")
          .select(
            "person_id, contact_id, webinar_id, webinar_title, name, device, country, city, joined_at, first_progress_at, last_progress_at",
            { count: "exact" },
          )
          .eq("organization_id", orgId!)
          .or(
            `joined_at.gte."${todayIso}",first_progress_at.gte."${todayIso}",last_progress_at.gte."${todayIso}"`,
          )
          .order("participant_id")
          .range(from, to),
      ),
  });

  /* ---------- Agenda ---------- */

  const monthStart = month ? new Date(month.year, month.month - 1, 1).toISOString() : null;
  const sessions = useQuery({
    queryKey: ["dashboard", "sessions", orgId, monthStart],
    enabled: Boolean(orgId) && monthStart !== null,
    queryFn: async () => {
      const end = new Date(month!.year, month!.month + 1, 1).toISOString();
      // ponytail: até 1000 sessões em dois meses; acima disso, fetchAll.
      const { data, error } = await supabase
        .from("webinar_sessions")
        .select("id, webinar_id, starts_at")
        .eq("organization_id", orgId!)
        .gte("starts_at", monthStart!)
        .lt("starts_at", end)
        .order("starts_at")
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const agenda = useMemo(() => {
    if (now === null || !month || !sessions.data || isLoading) return null;
    const items = list.map((w) => ({ ...w, title: titleOf(w) }));
    const next = month.month === 12 ? { year: month.year + 1, month: 1 } : { year: month.year, month: month.month + 1 };
    const days = monthEntries(items, sessions.data, month.year, month.month, now);
    const following = monthEntries(items, sessions.data, next.year, next.month, now);
    return {
      year: month.year,
      month: month.month,
      today: new Date(now).getDate(),
      nowMs: now,
      days,
      upcoming: entriesBetween([days, following], now, now + 30 * 86_400_000),
      open: list.flatMap((w) => {
        const l = lifecycleOf(w, now);
        return l.kind === "jit" || l.kind === "on_demand"
          ? [{ id: w.id, title: titleOf(w), when: openLabel(l) }]
          : [];
      }),
    };
  }, [now, month?.year, month?.month, sessions.data, list, isLoading]);

  const copyLink = (slug: string) => {
    void navigator.clipboard
      .writeText(`${publicOrigin()}/w/${slug}`)
      .then(() => toast.success("Link da sala copiado"))
      .catch(() => toast.error("Não foi possível copiar o link"));
  };

  const firstName = (workspace?.fullName ?? "").split(" ")[0] ?? "";
  const loadingWebinars = isLoading || !workspace || now === null;
  return (
    <AppShell title={firstName ? `Olá, ${firstName}` : "Painel"}>
      <AiJobsOverview className="mb-4" />
      <SyncJobsOverview className="mb-4" />
      <DashboardView
        hero={hero}
        heroLoading={loadingWebinars}
        hasWebinars={list.length > 0}
        onCopyLink={copyLink}
        period={period}
        onPeriod={setPeriod}
        results={view?.summary ?? null}
        resultsLoading={results.isLoading || !orgId}
        resultsError={results.isError}
        steps={view?.steps ?? null}
        mix={view?.mix ?? null}
        agenda={agenda}
        today={
          today.data && dayStart !== null && now !== null
            ? { ...todaySummary(today.data, dayStart), liveNow: nowCount(viewers.length, roomNow.all.total), nowMs: now }
            : null
        }
        recent={loadingWebinars ? null : recent}
      />
    </AppShell>
  );
}
