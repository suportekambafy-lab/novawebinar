/**
 * Trabalhos em segundo plano: ficam guardados no servidor, por isso continuam
 * mesmo que o utilizador feche o separador ou desligue o computador.
 */
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const enqueueSchema = z.object({
  webinarId: z.string().uuid(),
  webinarTitle: z.string().default(""),
  kind: z.enum(["chat", "sync"]),
  payload: z.record(z.string(), z.any()).default({}),
});

/** Lista os trabalhos deste utilizador (geração de chat e sincronização). */
export const listBackgroundJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("background_jobs")
      .select(
        "id, webinar_id, webinar_title, kind, status, stage, progress, note, error, payload, result, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return { jobs: data ?? [] };
  });

/** Coloca um trabalho na fila. O motor avança-o sozinho, etapa a etapa. */
export const enqueueBackgroundJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => enqueueSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: webinar, error: webinarError } = await context.supabase
      .from("webinars")
      .select("organization_id, public_title")
      .eq("id", data.webinarId)
      .maybeSingle();
    if (webinarError) throw new Error(webinarError.message);
    if (!webinar) throw new Error("Este webinar já não existe.");
    // Quem só atende lê os trabalhos, mas não os cria: um trabalho gasta créditos e muda o chat.
    const { assertWebinarWriter } = await import("@/integrations/supabase/auth-middleware");
    await assertWebinarWriter(context.supabase, data.webinarId);

    // Um trabalho por webinar e por tipo: o anterior dá lugar ao novo pedido.
    await context.supabase
      .from("background_jobs")
      .delete()
      .eq("webinar_id", data.webinarId)
      .eq("kind", data.kind);

    // Só o servidor cria trabalhos: o RLS acima já confirmou o acesso ao webinar
    // e a organização vem dele, nunca do cliente.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("background_jobs")
      .insert({
        webinar_id: data.webinarId,
        organization_id: webinar.organization_id,
        created_by: context.userId,
        kind: data.kind,
        webinar_title: data.webinarTitle || webinar.public_title || "",
        status: "queued",
        payload: data.payload,
      } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

/** Remove um trabalho (aprovado, rejeitado ou descartado). */
export const deleteBackgroundJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ webinarId: z.string().uuid(), kind: z.enum(["chat", "sync"]) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("background_jobs")
      .delete()
      .eq("webinar_id", data.webinarId)
      .eq("kind", data.kind);
    return { ok: true as const };
  });

/**
 * Dá um empurrão imediato à fila, para o trabalho arrancar no instante em que
 * é pedido, sem esperar pela passagem automática.
 */
export const kickBackgroundJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Cada pessoa só empurra os trabalhos das suas organizações.
    const { data: memberships, error } = await context.supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const { runPendingJobs } = await import("@/lib/job-runner.server");
    return runPendingJobs(
      55000,
      memberships.map((m) => m.organization_id),
    );
  });
