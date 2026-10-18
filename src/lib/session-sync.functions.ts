import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertWebinarAccess, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Depois de guardar um webinar: a hora de fim das sessões ainda por terminar segue o que ficou gravado
 * (vídeo trocado, contagem depois de começar, hora de fim). Antes só mudava quando alguém se inscrevia:
 * sem inscrições novas, a sessão acabava à hora antiga e cortava o fim do vídeo.
 */
export const syncOpenSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ webinarId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertWebinarAccess(context.supabase, data.webinarId);
    const { loadRegistrationWebinar } = await import("@/lib/registration.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { sessionEndFor } = await import("@/lib/session-sync");
    const webinar = await loadRegistrationWebinar(data.webinarId);
    if (!webinar) return { updated: 0 };
    const { data: open } = await supabaseAdmin
      .from("webinar_sessions")
      .select("id, starts_at, ends_at")
      .eq("webinar_id", data.webinarId)
      .is("ended_at", null)
      .limit(200);
    let updated = 0;
    for (const session of open ?? []) {
      const endMs = sessionEndFor(webinar, Date.parse(session.starts_at));
      if (endMs === undefined) continue;
      const next = endMs === null ? null : new Date(endMs).toISOString();
      if (next === session.ends_at || (next && session.ends_at && Date.parse(next) === Date.parse(session.ends_at))) continue;
      const { error } = await supabaseAdmin
        .from("webinar_sessions")
        .update({ ends_at: next })
        .eq("id", session.id)
        .is("ended_at", null);
      if (!error) updated += 1;
    }
    return { updated };
  });
