import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy, UserRoundCog } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { LiveBoard, type LiveSessionItem, type MomentItem } from "@/components/audience-insights";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAnalytics } from "@/lib/analytics";
import { fetchAll } from "@/lib/fetch-all";
import {
  ACTIVITY,
  ACTIVITY_NAMES,
  activityByMinute,
  liveNow,
  sessionsOf,
  spotsOf,
  useSystemDark,
} from "@/lib/analytics-live";
import { lifecycleOf, useWebinars, useWorkspace } from "@/lib/data";
import { resolveRange } from "@/lib/date-range";
import { formatSessionStart, lifecycleDetail, lifecycleLabel } from "@/lib/schedule";
import { useLiveViewers } from "@/lib/live-presence";
import { getTeamRoomToken } from "@/lib/room-team.functions";

export const Route = createFileRoute("/live-view")({
  validateSearch: (search: Record<string, unknown>): { webinar?: string | undefined } =>
    typeof search["webinar"] === "string" ? { webinar: search["webinar"] } : {},
  head: () => ({
    meta: [
      { title: "Vista ao vivo | Novawebinar" },
      {
        name: "description",
        content: "Veja em tempo real quem está nas suas salas, de onde assiste e quem clica na oferta.",
      },
      { property: "og:title", content: "Vista ao vivo | Novawebinar" },
      { property: "og:description", content: "Quem está na sala agora, de onde vê, a actividade ao minuto e as sessões a decorrer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LiveViewPage,
});

const WINDOW_MS = 30 * 60_000;

/** O nome (ou o e-mail) de quem aparece na lista de acontecimentos. */
async function namesOf(rows: { contact_id: string | null }[]) {
  const ids = [...new Set(rows.flatMap((r) => (r.contact_id ? [r.contact_id] : [])))];
  const names = new Map<string, string>();
  if (!ids.length) return names;
  const { data: people } = await supabase.from("contacts").select("id, name, email").in("id", ids);
  for (const p of people ?? []) names.set(p.id, p.name?.trim() || p.email || "");
  return names;
}

function LiveViewPage() {
  const { data: workspace } = useWorkspace();
  const organizationId = workspace?.organizationId;
  const { webinar } = Route.useSearch();
  const navigate = useNavigate();
  const dark = useSystemDark();
  const allViewers = useLiveViewers(organizationId);
  const viewers = useMemo(
    () => (webinar ? allViewers.filter((v) => v.webinarId === webinar) : allViewers),
    [allViewers, webinar],
  );
  const { data: webinars = [] } = useWebinars(organizationId);
  const selected = webinar ? webinars.find((w) => w.id === webinar) : undefined;
  // O estado da sessão vem do ciclo de vida canónico, não de quem está na sala.
  const lifecycle = selected ? lifecycleOf(selected) : null;

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  // A actividade vem do registo de acontecimentos: sobrevive a recarregar a página.
  const activityQuery = useQuery({
    queryKey: ["live-view", "activity", organizationId, webinar ?? "todos"],
    enabled: Boolean(organizationId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const until = new Date().toISOString();
      const since = new Date(Date.parse(until) - WINDOW_MS).toISOString();
      // As barras: tudo o que aconteceu na janela, página a página (sem corte nas sessões cheias).
      const rows = await fetchAll((from, to) => {
        let q = supabase
          .from("event_log")
          .select("name, occurred_at, contact_id", { count: "exact" })
          .eq("organization_id", organizationId!)
          .in("name", ACTIVITY_NAMES)
          .gte("occurred_at", since)
          .lte("occurred_at", until);
        if (webinar) q = q.eq("webinar_id", webinar);
        return q.order("occurred_at", { ascending: false }).order("source_id").order("name").range(from, to);
      });
      const latest = rows.slice(0, 6);
      return { rows, latest, names: await namesOf(latest) };
    },
  });

  // Janela vazia: a última actividade, para a frase «Última actividade». Uma linha, mas sem limite de data
  // (a vista junta o histórico todo): pede-se de 5 em 5 minutos, não a cada 15 segundos.
  const windowEmpty = activityQuery.data?.rows.length === 0;
  const lastQuery = useQuery({
    queryKey: ["live-view", "last-activity", organizationId, webinar ?? "todos"],
    enabled: Boolean(organizationId) && windowEmpty,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async () => {
      let q = supabase
        .from("event_log")
        .select("name, occurred_at, contact_id")
        .eq("organization_id", organizationId!)
        .in("name", ACTIVITY_NAMES)
        .lte("occurred_at", new Date().toISOString());
      if (webinar) q = q.eq("webinar_id", webinar);
      const { data, error } = await q.order("occurred_at", { ascending: false }).limit(1);
      if (error) throw error;
      const latest = data ?? [];
      return { latest, names: await namesOf(latest) };
    },
  });

  const activity = useMemo(() => {
    const rows = activityQuery.data?.rows ?? [];
    const source = rows.length ? activityQuery.data : lastQuery.data;
    const latest = source?.latest ?? [];
    const names = source?.names ?? new Map<string, string>();
    const moment = (row: (typeof latest)[number], i: number): MomentItem => {
      const what = ACTIVITY[row.name ?? ""] ?? { text: row.name ?? "", kind: "other" as const };
      return {
        id: `${row.occurred_at}-${i}`,
        who: (row.contact_id && names.get(row.contact_id)) || "Alguém",
        text: what.text,
        at: row.occurred_at ?? new Date(nowMs).toISOString(),
        kind: what.kind,
      };
    };
    const buckets = activityByMinute(rows, nowMs);
    // A lista usa o mesmo início que as barras: nada aparece por baixo de «Sem movimento».
    const from = buckets[0]?.at ?? nowMs - WINDOW_MS;
    return {
      buckets,
      moments: latest.filter((r) => r.occurred_at && Date.parse(r.occurred_at) >= from).map(moment),
      last: latest[0] ? moment(latest[0], 0) : null,
      loading: activityQuery.isLoading || !organizationId,
      failed: activityQuery.isError && !activityQuery.data,
    };
  }, [activityQuery.data, lastQuery.data, activityQuery.isLoading, activityQuery.isError, nowMs, organizationId]);

  const sessions = useMemo(() => {
    const scoped = webinars.filter((w) => !webinar || w.id === webinar);
    const byId = new Map(scoped.map((w) => [w.id, w]));
    const items = new Map<string, LiveSessionItem>();
    const describe = (id: string) => {
      const w = byId.get(id);
      if (!w) return { badge: "Sala aberta", detail: null };
      const lc = lifecycleOf(w, nowMs);
      const since =
        lc.kind === "session" && lc.state === "live"
          ? `desde as ${new Date(lc.startMs).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}`
          : null;
      return { badge: lifecycleLabel(lc), detail: since };
    };
    // Sessões marcadas que estão a decorrer, mesmo sem ninguém na sala.
    for (const w of scoped) {
      const lc = lifecycleOf(w, nowMs);
      if (lc.kind === "session" && lc.state === "live") {
        items.set(w.id, {
          webinarId: w.id,
          title: w.public_title || w.internal_name,
          count: 0,
          live: 0,
          replay: 0,
          clicked: 0,
          ...describe(w.id),
        });
      }
    }
    for (const s of sessionsOf(viewers)) items.set(s.webinarId, { ...s, ...describe(s.webinarId) });
    return [...items.values()].sort((a, b) => b.count - a.count);
  }, [webinars, webinar, viewers, nowMs]);

  const nextSession = useMemo(() => {
    let next: { title: string; when: string; at: number } | null = null;
    for (const w of webinars) {
      if (webinar && w.id !== webinar) continue;
      const lc = lifecycleOf(w, nowMs);
      if (lc.kind !== "session" || lc.state !== "scheduled") continue;
      if (!next || lc.startMs < next.at)
        next = { title: w.public_title || w.internal_name, when: formatSessionStart(lc.startMs, w.timezone), at: lc.startMs };
    }
    return next;
  }, [webinars, webinar, nowMs]);

  // O mesmo resumo das Análises: hoje, ou o webinar escolhido desde o início.
  const today = new Date(nowMs).toDateString();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- muda à meia-noite
  const range = useMemo(() => (webinar ? undefined : resolveRange("hoje")), [webinar, today]);
  // Um webinar é lido desde sempre (todas as inscrições): de 2 em 2 minutos chega; o dia, de 30 em 30 s.
  const summaryQuery = useAnalytics(organizationId, webinar, range, webinar ? 120_000 : 30_000);

  return (
    <AppShell
      title="Vista ao vivo"
      description={
        lifecycle && selected
          ? `${lifecycleLabel(lifecycle)} · ${lifecycleDetail(lifecycle, selected.timezone)}`
          : "Quem está nas suas salas neste momento, de onde vê e o que faz."
      }
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={webinar ?? "todos"}
            onValueChange={(value) =>
              void navigate({ to: "/live-view", search: value === "todos" ? {} : { webinar: value } })
            }
          >
            <SelectTrigger className="w-[min(240px,70vw)]" aria-label="Webinar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os webinars</SelectItem>
              {webinars.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.public_title || w.internal_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected ? <TeamLink webinarId={selected.id} slug={selected.slug} /> : null}
        </div>
      }
    >
      <LiveBoard
        dark={dark}
        nowMs={nowMs}
        scoped={Boolean(webinar)}
        now={liveNow(viewers)}
        viewers={viewers}
        spots={spotsOf(viewers)}
        sessions={sessions}
        nextSession={nextSession}
        activity={activity}
        summary={{
          title: webinar ? "Este webinar, até agora" : "Hoje, até agora",
          note: webinar
            ? "Todas as inscrições deste webinar e o que essas pessoas fizeram."
            : "Quem se inscreveu hoje e o que fez; facturação aprovada hoje.",
          data: summaryQuery.data,
          loading: summaryQuery.isLoading || !organizationId,
          search: webinar ? { webinar } : { periodo: "hoje" },
        }}
      />
    </AppShell>
  );
}

/**
 * A equipa na sala: entra a ver e comenta com o seu nome e o selo «Equipa» ou «Apresentador», sem contar na
 * audiência. «Copiar link» dá o link para quem não tem conta (moderadores, convidados).
 */
function TeamLink({ webinarId, slug }: { webinarId: string; slug: string }) {
  const getToken = useServerFn(getTeamRoomToken);
  // O código pede-se antes do clique: o Safari só deixa copiar no próprio gesto, sem esperar pelo servidor.
  const { data: token } = useQuery({
    queryKey: ["team-room-token", webinarId],
    queryFn: () => getToken({ data: { webinarId } }).then((r) => r.token),
    staleTime: Infinity,
  });
  const copy = () => {
    if (!token) return;
    const link = `${window.location.origin}/w/${slug}?equipa=${encodeURIComponent(token)}`;
    // Sem endereço seguro (http) o browser não dá a área de transferência.
    (navigator.clipboard?.writeText(link) ?? Promise.reject(new Error("sem clipboard"))).then(
      () => toast.success("Link de equipa copiado. Quem o abrir comenta com o selo da equipa."),
      () => toast.error("Não foi possível copiar o link de equipa."),
    );
  };
  return (
    <>
      <Button asChild size="sm" className="gap-2">
        <a href={`/w/${slug}?equipa=1`} target="_blank" rel="noopener">
          <UserRoundCog className="size-4" />
          Entrar como equipa
        </a>
      </Button>
      <Button variant="outline" size="sm" className="gap-2" disabled={!token} onClick={copy}>
        <Copy className="size-4" />
        Copiar link de equipa
      </Button>
    </>
  );
}
