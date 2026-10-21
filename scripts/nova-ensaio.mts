// Ensaio do Método Nova num trecho real, sem gravar nada: imprime o guião escrito pela IA.
import { createClient } from "@supabase/supabase-js";

import { generateCommentsWindowImpl, planCommentWindowsImpl } from "@/lib/ai-comments.functions";

const url = process.env["VITE_SUPABASE_URL"]!;
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? process.env["SUPABASE_SECRET_KEY"]!;
const supabase = createClient(url, key, { auth: { persistSession: false } });
const webinarId = process.argv[2] ?? "5034b43e-0117-4550-90ae-7406f25ce60f";
const from = Number(process.argv[3] ?? 0);
const to = Number(process.argv[4] ?? 300);

const { data: version } = await supabase
  .from("webinar_transcript_versions")
  .select("sentences")
  .eq("webinar_id", webinarId)
  .eq("status", "ready")
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
const sentences = (version?.sentences ?? []) as { startMs: number; text: string }[];
const transcript = sentences.map((s) => ({ at: Math.round(s.startMs / 1000), text: s.text }));

const settings = {
  variant: "mix:br,pt",
  level: "medium",
  participants: 25,
  emojis: "normal",
  tone: "natural",
  customTone: "",
  densityByMoment: true,
  frequency: 0,
  targetTotal: 0,
};

const plan = await planCommentWindowsImpl(supabase, { webinarId, settings, transcript });
console.log(`elenco: ${plan.cast.length} pessoas; alunas: ${plan.cast.filter((m: { role: string }) => m.role === "aluna").map((m: { name: string }) => m.name).join(", ")}`);
console.log(plan.cast.slice(0, 6).map((m: { name: string; situation: string; arrivalMs: number }) => `  ${m.name} · chega ${Math.round(m.arrivalMs / 1000)}s · ${m.situation}`).join("\n"));

const result = await generateCommentsWindowImpl(supabase, {
  webinarId,
  settings,
  transcript: transcript.filter((s) => s.at >= from - 120 && s.at <= to + 120),
  window: { from, to, howMany: 60 },
  bounds: { start: 0, end: 3589 },
  existing: [],
  cast: plan.cast,
});
const clock = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
console.log(`\n${result.comments.length} mensagens de ${clock(from)} a ${clock(to)}:`);
for (const c of result.comments as { at: number; author: string; message: string; dependency?: string; blockType?: string | null; slot?: string | null }[])
  console.log(`${clock(c.at)} ${(c.dependency ?? "-").padEnd(11)} ${(c.blockType ?? "").padEnd(20)} ${c.author}: ${c.message}`);
