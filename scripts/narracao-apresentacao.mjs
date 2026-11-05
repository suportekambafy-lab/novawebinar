#!/usr/bin/env node
/**
 * Gera o som da apresentação do hero (landing/showreel.tsx): a narração com a ElevenLabs, a música de
 * fundo (Eleven Music, planos pagos) e a mistura final com o ffmpeg, numa só faixa com a duração da
 * apresentação. A música baixa sozinha quando a voz fala.
 *
 *   node scripts/narracao-apresentacao.mjs            gera e mistura
 *   node scripts/narracao-apresentacao.mjs --sem-musica
 *   node scripts/narracao-apresentacao.mjs --ensaio      voz do macOS (Joana), sem gastar créditos;
 *                                                        grava em ensaio.mp3, nunca no som da página
 *
 * Lê do .env: ELEVENLABS_API_KEY (obrigatória), ELEVENLABS_VOICE_ID (opcional) e ELEVENLABS_MODEL
 * (opcional, eleven_multilingual_v2 por omissão). O texto e os tempos estão em
 * src/components/landing/showreel-narracao.json. Resultado: src/assets/landing/apresentacao/som.mp3.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8")
    .split("\n")
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\r]*)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].trim()]),
);
const rehearsal = process.argv.includes("--ensaio");
const key = env.ELEVENLABS_API_KEY;
if (!key && !rehearsal) throw new Error("Falta ELEVENLABS_API_KEY no .env.");
// Daniel (voz padrão da ElevenLabs, grave e calma); trocar por uma voz de português de Portugal da conta.
const voice = env.ELEVENLABS_VOICE_ID || "onwK4e9ZLuTAKqWW03F9";
const model = env.ELEVENLABS_MODEL || "eleven_multilingual_v2";
const script = JSON.parse(readFileSync(join(root, "src/components/landing/showreel-narracao.json"), "utf8"));
const withMusic = !rehearsal && !process.argv.includes("--sem-musica");

const work = mkdtempSync(join(tmpdir(), "narracao-"));
const outDir = join(root, "src/assets/landing/apresentacao");
mkdirSync(outDir, { recursive: true });

async function eleven(path, body) {
  const response = await fetch(`https://api.elevenlabs.io${path}`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`ElevenLabs ${path} respondeu ${response.status}: ${detail.slice(0, 300)}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

const duration = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim());

// 1. As falas, uma a uma, com o texto vizinho para a entoação seguir a frase anterior e a seguinte.
const lines = [];
for (const [i, line] of script.falas.entries()) {
  const file = join(work, `fala-${i}.${rehearsal ? "aiff" : "mp3"}`);
  if (rehearsal) execFileSync("say", ["-v", "Joana", "-o", file, line.texto]);
  else writeFileSync(file, await eleven(`/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    text: line.texto,
    model_id: model,
    previous_text: script.falas[i - 1]?.texto,
    next_text: script.falas[i + 1]?.texto,
    voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
  }));
  const len = duration(file);
  const next = script.falas[i + 1]?.at ?? script.duracao;
  const room = next - line.at - 0.2;
  console.log(`fala ${i + 1}: ${len.toFixed(2)} s (cabe em ${room.toFixed(2)} s)${len > room ? "  ← passa o tempo, encurtar o texto" : ""}`);
  lines.push({ file, at: line.at });
}

// 2. A música de fundo, com a duração da apresentação.
let music = null;
if (withMusic) {
  try {
    music = join(work, "musica.mp3");
    writeFileSync(music, await eleven("/v1/music", { prompt: script.musica, music_length_ms: script.duracao * 1000 }));
    console.log(`música: ${duration(music).toFixed(2)} s`);
  } catch (error) {
    console.warn(`Sem música: ${error.message}`);
    music = null;
  }
}

// 3. A mistura: cada fala no seu segundo, a música por baixo a baixar quando há voz, volume normalizado.
const inputs = [...lines.flatMap((l) => ["-i", l.file]), ...(music ? ["-i", music] : [])];
const voices = lines
  .map((l, i) => `[${i}:a]adelay=${Math.round(l.at * 1000)}|${Math.round(l.at * 1000)},aformat=channel_layouts=stereo[v${i}]`)
  .join(";");
const voiceMix = `${lines.map((_, i) => `[v${i}]`).join("")}amix=inputs=${lines.length}:normalize=0,apad=whole_dur=${script.duracao}[voz]`;
const filter = music
  ? `${voices};${voiceMix};[voz]asplit=2[voz1][chave];[${lines.length}:a]volume=0.32,apad=whole_dur=${script.duracao}[bg];[bg][chave]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[bgd];[voz1][bgd]amix=inputs=2:normalize=0,atrim=0:${script.duracao},afade=t=out:st=${script.duracao - 1.5}:d=1.5,loudnorm=I=-16:TP=-1.5:LRA=11[out]`
  : `${voices};${voiceMix};[voz]atrim=0:${script.duracao},loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
const out = rehearsal ? join(work, "ensaio.mp3") : join(outDir, "som.mp3");
execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filter, "-map", "[out]", "-ar", "44100", "-b:a", "128k", out]);
console.log(`\nPronto: ${out.replace(root, "")} (${duration(out).toFixed(2)} s)${existsSync(out) ? "" : " — falhou"}`);
