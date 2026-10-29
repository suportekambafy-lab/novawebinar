/**
 * Webinar Intelligence, do lado do servidor. Quem pede tem sessão iniciada; cada função confirma que a
 * pessoa é da organização (quem só atende não gere links). As escritas correm com a chave de serviço.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { smartLinkInput, type SmartLinkRow, type SmartLinkSummary, type SmartLinkWebinar } from "./model";

const uuid = z.string().uuid();

async function memberRole(supabase: SupabaseClient<Database>, organizationId: string, userId: string, write = false) {
  const { data } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Sem acesso a esta organização.");
  if (write && data.role === "support") throw new Error("Quem só atende não gere o Webinar Intelligence.");
  return data.role;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadLink(linkId: string): Promise<SmartLinkRow> {
  const db = await admin();
  const { data, error } = await db.from("smart_links").select("*").eq("id", linkId).maybeSingle();
  if (error) throw new Error("Não foi possível ler o link.");
  if (!data) throw new Error("Link não encontrado.");
  return data as SmartLinkRow;
}

/** O endereço tem de ser único entre webinars, testes A/B e links: todos abrem em /w/<endereço>. */
async function assertSlugFree(slug: string, exceptLinkId?: string) {
  const { publicSlugTaken } = await import("@/lib/public-slug.functions");
  if (await publicSlugTaken(slug, exceptLinkId ? { linkId: exceptLinkId } : {}))
    throw new Error("Esse endereço já está a ser usado por um webinar, um teste A/B ou outro link.");
}

async function assertWebinarsOfOrg(organizationId: string, ids: string[]) {
  const db = await admin();
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return;
  const { data } = await db.from("webinars").select("id, status").eq("organization_id", organizationId).in("id", wanted);
  const found = new Map((data ?? []).map((w) => [w.id, w.status]));
  for (const id of wanted) {
    const status = found.get(id);
    if (!status) throw new Error("Escolha webinars desta organização.");
    if (status === "draft") throw new Error("Escolha webinars já publicados.");
  }
}

async function webinarsById(ids: string[]): Promise<Map<string, SmartLinkWebinar>> {
  const db = await admin();
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return new Map();
  const { data } = await db.from("webinars").select("id, public_title, internal_name, slug, status").in("id", wanted);
  return new Map((data ?? []).map((w) => [w.id, w as SmartLinkWebinar]));
}

async function summaries(links: SmartLinkRow[]): Promise<SmartLinkSummary[]> {
  if (links.length === 0) return [];
  const db = await admin();
  const webinars = await webinarsById(links.flatMap((l) => [l.primary_webinar_id, l.secondary_webinar_id ?? ""]));
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  // Contagens feitas na base de dados: ler as linhas parava aos 1000 (o máximo do PostgREST).
  const count = async (linkId: string, returning: boolean, since: string | null) => {
    let q = db.from("smart_link_visits").select("id", { count: "exact", head: true }).eq("smart_link_id", linkId);
    if (returning) q = q.eq("returning_visitor", true);
    if (since) q = q.gte("created_at", since);
    const { count: n } = await q;
    return n ?? 0;
  };
  const counts = new Map<string, SmartLinkSummary["visits"]>();
  await Promise.all(
    links.map(async (link) => {
      const [total, returning, week, weekReturning] = await Promise.all([
        count(link.id, false, null),
        count(link.id, true, null),
        count(link.id, false, weekAgo),
        count(link.id, true, weekAgo),
      ]);
      counts.set(link.id, { total, returning, week, weekReturning });
    }),
  );
  return links.map((link) => ({
    link,
    primary: webinars.get(link.primary_webinar_id) ?? null,
    secondary: link.secondary_webinar_id ? (webinars.get(link.secondary_webinar_id) ?? null) : null,
    visits: counts.get(link.id) ?? { total: 0, returning: 0, week: 0, weekReturning: 0 },
  }));
}

export const listSmartLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ organizationId: uuid }).parse(data))
  .handler(async ({ data, context }): Promise<SmartLinkSummary[]> => {
    await memberRole(context.supabase, data.organizationId, context.userId);
    const db = await admin();
    const { data: rows, error } = await db
      .from("smart_links")
      .select("*")
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não foi possível ler os links.");
    return summaries((rows ?? []) as SmartLinkRow[]);
  });

export const createSmartLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => smartLinkInput.extend({ organizationId: uuid }).parse(data))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    await memberRole(context.supabase, data.organizationId, context.userId, true);
    if (data.secondaryWebinarId === data.primaryWebinarId) throw new Error("O favorito e o secundário têm de ser webinars diferentes.");
    await assertSlugFree(data.slug);
    await assertWebinarsOfOrg(data.organizationId, [data.primaryWebinarId, ...(data.secondaryWebinarId ? [data.secondaryWebinarId] : [])]);
    const db = await admin();
    const { data: row, error } = await db
      .from("smart_links")
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        slug: data.slug,
        primary_webinar_id: data.primaryWebinarId,
        secondary_webinar_id: data.secondaryWebinarId,
        status: "active",
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.code === "23505" ? "Esse endereço já está a ser usado." : "Não foi possível criar o link.");
    const { clearSmartLinkCache } = await import("./resolve.server");
    clearSmartLinkCache();
    return { id: row.id };
  });

export const updateSmartLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        linkId: uuid,
        patch: smartLinkInput.partial().extend({ status: z.enum(["active", "paused"]).optional() }),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const link = await loadLink(data.linkId);
    await memberRole(context.supabase, link.organization_id, context.userId, true);
    const patch = data.patch;
    const primary = patch.primaryWebinarId ?? link.primary_webinar_id;
    const secondary = patch.secondaryWebinarId === undefined ? link.secondary_webinar_id : patch.secondaryWebinarId;
    if (secondary && secondary === primary) throw new Error("O favorito e o secundário têm de ser webinars diferentes.");
    if (patch.slug && patch.slug !== link.slug) await assertSlugFree(patch.slug, link.id);
    await assertWebinarsOfOrg(link.organization_id, [primary, ...(secondary ? [secondary] : [])]);
    const db = await admin();
    const { error } = await db
      .from("smart_links")
      .update({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
        primary_webinar_id: primary,
        secondary_webinar_id: secondary,
        ...(patch.status ? { status: patch.status } : {}),
      })
      .eq("id", link.id);
    if (error) throw new Error(error.code === "23505" ? "Esse endereço já está a ser usado." : "Não foi possível guardar o link.");
    const { clearSmartLinkCache } = await import("./resolve.server");
    clearSmartLinkCache();
    return { ok: true };
  });

export const deleteSmartLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ linkId: uuid }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const link = await loadLink(data.linkId);
    await memberRole(context.supabase, link.organization_id, context.userId, true);
    const db = await admin();
    const { error } = await db.from("smart_links").delete().eq("id", link.id);
    if (error) throw new Error("Não foi possível apagar o link.");
    const { clearSmartLinkCache } = await import("./resolve.server");
    clearSmartLinkCache();
    return { ok: true };
  });
