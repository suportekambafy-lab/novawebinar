import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import {
  AgendaMonth,
  AgendaPage,
  AgendaSuggestions,
  AgendaWebinars,
  type AgendaWebinarRow,
} from "@/components/calendar-view";
import { PageSkeleton } from "@/components/page-skeleton";
import { supabase } from "@/integrations/supabase/client";
import { monthEntries, scheduleSummary, suggestSlots } from "@/lib/agenda";
import { fetchAll } from "@/lib/fetch-all";
import { lifecycleOf, useWebinars, useWorkspace, type Webinar } from "@/lib/data";
import { lifecycleLabel } from "@/lib/schedule";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "Agenda | Novawebinar" },
      {
        name: "description",
        content: "Os dias de cada webinar e os melhores dias e horas para os marcar.",
      },
      { property: "og:title", content: "Agenda | Novawebinar" },
      { property: "og:description", content: "Organize a agenda de webinars." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalendarPage,
});

const titleOf = (w: Pick<Webinar, "public_title" | "internal_name">) =>
  w.public_title || w.internal_name;

/** Um webinar na lista: a decorrer a vermelho, marcado ou sempre aberto a laranja, o resto a cinzento. */
function agendaRow(
  w: Webinar & { video_sources?: { duration_seconds: number | null } | null },
  nowMs: number,
): AgendaWebinarRow {
  const lifecycle = lifecycleOf(w, nowMs);
  const tone =
    lifecycle.kind === "session"
      ? lifecycle.state === "live"
        ? "live"
        : lifecycle.state === "scheduled"
          ? "next"
          : "muted"
      : lifecycle.kind === "draft"
        ? "muted"
        : "next";
  // No just in time a linha de baixo já diz «A cada 15 min».
  const state = lifecycle.kind === "jit" ? "Activo" : lifecycleLabel(lifecycle);
  return { id: w.id, title: titleOf(w), when: scheduleSummary(w), state, tone };
}

function CalendarPage() {
  const { data: workspace } = useWorkspace();
  const orgId = workspace?.organizationId;
  const { data: webinars = [], isLoading } = useWebinars(orgId);
  // Sessões reais e, de cada pessoa, a sessão, a presença e a compra: a base das sugestões.
  const agenda = useQuery({
    queryKey: ["agenda", orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const [sessions, facts] = await Promise.all([
        fetchAll((from, to) =>
          supabase
            .from("webinar_sessions")
            .select("id, webinar_id, starts_at", { count: "exact" })
            .eq("organization_id", orgId!)
            .order("starts_at")
            .order("id")
            .range(from, to),
        ),
        fetchAll((from, to) =>
          supabase
            .from("participant_facts")
            .select("person_id, webinar_session_id, attended, viewing_mode, purchased", {
              count: "exact",
            })
            .eq("organization_id", orgId!)
            .not("webinar_session_id", "is", null)
            .order("participant_id")
            .range(from, to),
        ),
      ]);
      return { sessions, facts };
    },
  });

  // O mês e "agora" só no browser: no servidor a data seria outra.
  const [now, setNow] = useState<number | null>(null);
  const [cursor, setCursor] = useState({ year: 0, month: 0 });
  useEffect(() => {
    const d = new Date();
    setNow(d.getTime());
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }, []);

  const view = useMemo(() => {
    if (now === null) return null;
    const list = webinars.map((w) => ({ ...w, title: titleOf(w) }));
    const zones = new Map(webinars.map((w) => [w.id, w.timezone]));
    const titles = new Map(list.map((w) => [w.id, w.title]));
    const sessions = agenda.data?.sessions ?? [];
    return {
      entries: monthEntries(list, sessions, cursor.year, cursor.month, now),
      suggestions: agenda.data
        ? suggestSlots(sessions, agenda.data.facts, (id) => zones.get(id), now)
        : null,
      titleOf: (id: string) => titles.get(id) ?? "Webinar apagado",
      rows: webinars.map((w) => agendaRow(w, now)),
    };
  }, [webinars, agenda.data, cursor, now]);

  // 0 volta ao mês de hoje.
  const move = (step: -1 | 0 | 1) => {
    const d = step ? new Date(cursor.year, cursor.month - 1 + step, 1) : new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() + 1 });
  };

  const today = now === null ? null : new Date(now);
  return (
    <AppShell
      title="Agenda"
      description="Os dias de cada webinar e os melhores para marcar o próximo."
    >
      {!view || isLoading || !orgId ? (
        <PageSkeleton variant="calendar" />
      ) : (
        <AgendaPage
          month={
            <AgendaMonth
              year={cursor.year}
              month={cursor.month}
              today={
                today &&
                today.getFullYear() === cursor.year &&
                today.getMonth() + 1 === cursor.month
                  ? today.getDate()
                  : null
              }
              entries={view.entries}
              nowMs={now!}
              onMove={move}
            />
          }
          suggestions={
            !agenda.isError && (
              <AgendaSuggestions suggestions={view.suggestions} titleOf={view.titleOf} />
            )
          }
          webinars={<AgendaWebinars rows={view.rows} />}
        />
      )}
    </AppShell>
  );
}
