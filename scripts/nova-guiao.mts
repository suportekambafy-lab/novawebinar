// Mostra o guião do Método Nova para um trecho de um webinar real, sem chamar a IA e sem gravar nada.
// Uso: npx tsx scripts/nova-guiao.mts <webinarId> <deSegundo> <atéSegundo>
import { createClient } from "@supabase/supabase-js";

import { buildCast, namedPeople } from "@/lib/chat-engine/cast";
import { ensureVersionBlocks } from "@/lib/chat-engine/classify.server";
import { offerStartFromBlocks, planInteractions } from "@/lib/chat-engine/plan";
import { buildScript, describeScript } from "@/lib/chat-engine/script";
import { latestReadyVersion } from "@/lib/temporal/engine.server";

const url = process.env["VITE_SUPABASE_URL"]!;
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_SECRET_KEY"]!;
const supabase = createClient(url, key, { auth: { persistSession: false } });
const webinarId = process.argv[2] ?? "5034b43e-0117-4550-90ae-7406f25ce60f";
const from = Number(process.argv[3] ?? 0);
const to = Number(process.argv[4] ?? 300);

const { data: webinar } = await supabase
  .from("webinars")
  .select("host_name, cta_text, cta_start_seconds, video_sources(duration_seconds)")
  .eq("id", webinarId)
  .maybeSingle();
const hostName = (webinar?.host_name as string | null) ?? null;
const version = await latestReadyVersion(webinarId);
if (!version) throw new Error("sem transcrição pronta");
// «fresh» no fim: volta a cortar os blocos pelas regras actuais (sem IA).
const { blocks } = await ensureVersionBlocks(version, { ai: false, force: process.argv.includes("fresh") });
const durationMs = Math.max(version.durationSeconds, Number((webinar?.video_sources as { duration_seconds?: number } | null)?.duration_seconds ?? 0)) * 1000;
const offerStartMs =
  webinar?.cta_text && webinar?.cta_start_seconds != null ? Number(webinar.cta_start_seconds) * 1000 : offerStartFromBlocks(blocks);
const slots = planInteractions(blocks, { fromMs: from * 1000, toMs: to * 1000, participants: 25, perMinute: 5, offerStartMs, hostName });
const cast = buildCast({ participants: 25, countries: ["br", "pt"], durationMs, seed: 11, hostName }, namedPeople(blocks, hostName));
const lines = buildScript(slots, cast, { fromMs: from * 1000, toMs: to * 1000, seed: 11, perMinute: 5, offerStartMs, existing: [] });

console.log(`blocos: ${blocks.length} · oferta aos ${offerStartMs == null ? "?" : Math.round(offerStartMs / 1000)}s · elenco ${cast.length} (alunas: ${cast.filter((m) => m.role === "aluna").map((m) => m.name).join(", ")})`);
console.log(`oportunidades no trecho: ${slots.length} · linhas: ${lines.length}\n`);
console.log(describeScript(lines, slots));

if (process.argv[5] === "slots") {
  const { describeSlots } = await import("@/lib/chat-engine/plan");
  console.log("\nOPORTUNIDADES:\n" + describeSlots(slots));
}
