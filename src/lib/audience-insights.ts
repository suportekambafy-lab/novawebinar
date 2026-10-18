import { useQuery } from "@tanstack/react-query";
import { NOT_TEST_ROOM } from "@/lib/test-room";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { rangeKey, type DateRange } from "@/lib/date-range";
import { FACT_COLUMNS, funnelSummary } from "@/lib/participant-facts";

/**
 * Dados de audiência partilhados pelo painel inicial e pelo analítico:
 * funil de conversão, participantes por dia, dispositivos, origem e agenda.
 * Tudo vem de registos reais — nada aqui é simulado.
 */

export type FunnelStep = { label: string; value: number; share: number };

export type AudienceInsights = {
  funnel: FunnelStep[];
  daily: { label: string; value: number }[];
  devices: { mobile: number; desktop: number; unknown: number };
  regions: { label: string; value: number }[];
  scheduled: string[];
};

const dayKey = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
};

export function useAudienceInsights(
  organizationId?: string,
  webinarId?: string,
  range?: DateRange,
) {
  return useQuery<AudienceInsights>({
    queryKey: ["audience-insights", organizationId, webinarId ?? "todos", rangeKey(range)],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const scope = <T extends { eq: (col: string, val: string) => T }>(q: T) =>
        webinarId ? q.eq("webinar_id", webinarId) : q;
      const period = <T extends { gte: (col: string, val: string) => T; lt: (col: string, val: string) => T }>(
        q: T,
        column: string,
      ) => (range ? q.gte(column, range.from).lt(column, range.to) : q);

      const [people, webinarsRes, sessionsRes] =
        await Promise.all([
          fetchAll((from, to) =>
            period(
              scope(
                supabase
                  .from("participant_facts")
                  .select(`${FACT_COLUMNS}, joined_at, device, country`, {
                    count: "exact",
                  })
                  .eq("organization_id", organizationId!)
                  .or(NOT_TEST_ROOM),
              ),
              "joined_at",
            )
              .order("joined_at", { ascending: false })
              .order("participant_id")
              .range(from, to),
          ),
          supabase
            .from("webinars")
            .select("id, scheduled_at")
            .eq("organization_id", organizationId!),
          // As sessões do webinar (ou da conta) no período, todas: antes eram 1000 quaisquer da conta inteira e
          // os dias de um webinar podiam faltar.
          fetchAll((from, to) =>
            period(
              scope(
                supabase
                  .from("webinar_sessions")
                  .select("id, webinar_id, starts_at", { count: "exact" })
                  .eq("organization_id", organizationId!),
              ),
              "starts_at",
            )
              .order("starts_at")
              .order("id")
              .range(from, to),
          ).then((data) => ({ data })),
        ]);

      // Pessoas, uma vez por webinar; depois de "Assistiram", cada passo só conta
      // quem assistiu. Comprou = compra aprovada atribuída a esse webinar.
      const f = funnelSummary(people);
      const visits = f.registered;
      const share = (value: number) => (visits ? (value / visits) * 100 : 0);
      const funnel: FunnelStep[] = [
        { label: "Inscritos", value: visits, share: visits ? 100 : 0 },
        { label: "Assistiram", value: f.attended, share: share(f.attended) },
        { label: "Chegou ao pitch", value: f.reachedPitch, share: share(f.reachedPitch) },
        { label: "Viram a oferta", value: f.sawOffer, share: share(f.sawOffer) },
        { label: "Clicaram", value: f.clicked, share: share(f.clicked) },
        { label: "Iniciaram o pagamento", value: f.checkout, share: share(f.checkout) },
        { label: "Compraram", value: f.buyers, share: share(f.buyers) },
      ];

      // Como no Painel: cada pessoa conta uma vez por webinar (dois aparelhos = uma pessoa).
      const days: { label: string; value: number }[] = [];
      const perDay = new Map<string, Set<string>>();
      const latest = new Map<string, (typeof people)[number]>();
      for (const person of people) {
        const key = `${person.person_id}:${person.webinar_id}`;
        if (!latest.has(key)) latest.set(key, person); // vêm da mais recente para a mais antiga
        if (!person.joined_at) continue;
        const day = dayKey(person.joined_at);
        perDay.set(day, (perDay.get(day) ?? new Set<string>()).add(key));
      }
      const counts = new Map([...perDay].map(([day, set]) => [day, set.size]));
      const rangeStart = range ? new Date(range.from) : null;
      const rangeEnd = range ? new Date(range.to) : null;
      let spanDays = 15;
      if (rangeStart && rangeEnd) {
        const diff = Math.ceil((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000);
        spanDays = Math.min(Math.max(diff, 1), 120);
      }
      for (let i = spanDays - 1; i >= 0; i -= 1) {
        const date = rangeEnd ? new Date(rangeEnd) : new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - (rangeEnd ? i + 1 : i));
        days.push({
          label: `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`,
          value: counts.get(dayKey(date)) ?? 0,
        });
      }

      const devices = { mobile: 0, desktop: 0, unknown: 0 };
      const regionCounts = new Map<string, number>();
      for (const person of latest.values()) {
        if (person.device === "mobile") devices.mobile += 1;
        else if (person.device === "desktop") devices.desktop += 1;
        else devices.unknown += 1;
        const region = (person.country ?? "").trim() || "Origem desconhecida";
        regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
      }
      const regions = [...regionCounts.entries()]
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);

      const scheduled = new Set<string>();
      for (const webinar of webinarsRes.data ?? []) {
        if (webinarId && webinar.id !== webinarId) continue;
        if (webinar.scheduled_at) scheduled.add(dayKey(webinar.scheduled_at));
      }
      for (const session of sessionsRes.data ?? []) {
        if (webinarId && session.webinar_id !== webinarId) continue;
        if (session.starts_at) scheduled.add(dayKey(session.starts_at));
      }

      return { funnel, daily: days, devices, regions, scheduled: [...scheduled] };
    },
  });
}
