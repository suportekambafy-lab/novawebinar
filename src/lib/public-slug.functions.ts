/**
 * Um endereço público (/w/<endereço>) é de um só dono: um webinar, um teste A/B ou um endereço do Webinar
 * Intelligence. A sala resolve por esta ordem, por isso um webinar com o endereço de um teste ou de um link
 * de outra conta ficava com o tráfego deles. As regras de leitura só mostram a própria conta: a
 * verificação tem de ser no servidor.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { assertWebinarAccess, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export async function publicSlugTaken(
  slug: string,
  except: { webinarId?: string; testId?: string; linkId?: string } = {},
): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [webinars, tests, links] = await Promise.all([
    supabaseAdmin.from("webinars").select("id").eq("slug", slug).limit(2),
    supabaseAdmin.from("ab_tests").select("id").eq("slug", slug).limit(2),
    supabaseAdmin.from("smart_links").select("id").eq("slug", slug).limit(2),
  ]);
  if (webinars.error || tests.error || links.error) throw new Error("Não foi possível confirmar o endereço. Tente novamente.");
  return (
    (webinars.data ?? []).some((r) => r.id !== except.webinarId) ||
    (tests.data ?? []).some((r) => r.id !== except.testId) ||
    (links.data ?? []).some((r) => r.id !== except.linkId)
  );
}

export const checkWebinarSlug = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ webinarId: z.string().uuid(), slug: z.string().trim().min(1).max(120) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertWebinarAccess(context.supabase, data.webinarId);
    return { taken: await publicSlugTaken(data.slug, { webinarId: data.webinarId }) };
  });
