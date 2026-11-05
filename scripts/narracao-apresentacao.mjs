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
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
// George (voz padrão e gratuita da ElevenLabs, calma e quente); em português sai com sotaque do Brasil.
const voice = env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb";
// Flash v2.5: metade dos créditos por caractere do multilingual v2 e aceita o idioma explícito.
const model = env.ELEVENLABS_MODEL || "eleven_flash_v2_5";
const script = JSON.parse(readFileSync(join(root, "src/components/landing/showreel-narracao.json"), "utf8"));
const withMusic = !process.argv.includes("--sem-musica");

const work = mkdtempSync(join(tmpdir(), "narracao-"));
const outDir = join(root, "src/assets/landing/apresentacao");
// Cada fala gerada fica guardada pelo texto, voz e modelo: gerar outra vez não volta a gastar créditos.
const cacheDir = join(root, "scripts/narracao-falas");
mkdirSync(cacheDir, { recursive: true });
const cached = (text) => join(cacheDir, `${createHash("sha1").update(`${voice}|${model}|${text}`).digest("hex").slice(0, 16)}.mp3`);
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
  else if (existsSync(cached(line.texto))) copyFileSync(cached(line.texto), file);
  else writeFileSync(file, await eleven(`/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    text: line.texto,
    model_id: model,
    ...(/flash|turbo/.test(model) ? { language_code: "pt" } : {}),
    previous_text: script.falas[i - 1]?.texto,
    next_text: script.falas[i + 1]?.texto,
    voice_settings: { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true },
  }));
  if (!rehearsal && !existsSync(cached(line.texto))) copyFileSync(file, cached(line.texto));
  const len = duration(file);
  const next = script.falas[i + 1]?.at ?? script.duracao;
  const room = next - line.at - 0.2;
  console.log(`fala ${i + 1}: ${len.toFixed(2)} s (cabe em ${room.toFixed(2)} s)${len > room ? "  ← passa o tempo, encurtar o texto" : ""}`);
  lines.push({ file, at: line.at });
}

/**
 * Sem a Eleven Music (só nos planos pagos): um fundo de acordes suaves feito aqui, com quatro acordes
 * (Lá menor 7, Fá maior 7, Dó, Sol) que se fundem, filtrados e com eco, para ficar discreto atrás da voz.
 */
function synthPad(file) {
  const chords = [
    [110, 164.81, 196, 261.63],
    [87.31, 174.61, 220, 329.63],
    [130.81, 196, 261.63, 329.63],
    [98, 196, 246.94, 293.66],
  ];
  const seg = (script.duracao + 3 * 2) / 4;
  const sources = chords.map((freqs) => {
    const tones = freqs.map((f, k) => `${k === 0 ? 0.32 : 0.2}*sin(2*PI*${f}*t)+0.05*sin(2*PI*${f * 2.0}*t)`).join("+");
    return ["-f", "lavfi", "-i", `aevalsrc='(${tones})*(0.75+0.25*sin(2*PI*0.18*t))':s=44100:d=${seg}`];
  });
  const fades = chords.map((_, i) => `[${i}:a]afade=t=in:d=2.5,afade=t=out:st=${seg - 2.5}:d=2.5[c${i}]`).join(";");
  const filter = `${fades};[c0][c1]acrossfade=d=2[x1];[x1][c2]acrossfade=d=2[x2];[x2][c3]acrossfade=d=2,lowpass=f=1300,aecho=0.8:0.6:140|290:0.3|0.2,volume=0.5,atrim=0:${script.duracao},aformat=channel_layouts=stereo[m]`;
  execFileSync("ffmpeg", ["-y", "-v", "error", ...sources.flat(), "-filter_complex", filter, "-map", "[m]", file]);
}

// 2. A música de fundo, com a duração da apresentação.
let music = null;
if (withMusic) {
  music = join(work, "musica.mp3");
  try {
    if (rehearsal) throw new Error("ensaio sem créditos");
    writeFileSync(music, await eleven("/v1/music", { prompt: script.musica, music_length_ms: script.duracao * 1000 }));
  } catch (error) {
    console.warn(`Eleven Music indisponível (${error.message.slice(0, 80)}): fundo de acordes feito aqui.`);
    music = join(work, "musica.wav");
    synthPad(music);
  }
  console.log(`música: ${duration(music).toFixed(2)} s`);
}

// 3. A mistura: cada fala no seu segundo, a música por baixo a baixar quando há voz, volume normalizado.
const inputs = [...lines.flatMap((l) => ["-i", l.file]), ...(music ? ["-i", music] : [])];
const voices = lines
  .map((l, i) => `[${i}:a]adelay=${Math.round(l.at * 1000)}|${Math.round(l.at * 1000)},aformat=channel_layouts=stereo[v${i}]`)
  .join(";");
const voiceMix = `${lines.map((_, i) => `[v${i}]`).join("")}amix=inputs=${lines.length}:normalize=0,apad=whole_dur=${script.duracao}[voz]`;
const filter = music
  ? `${voices};${voiceMix};[voz]asplit=2[voz1][chave];[${lines.length}:a]volume=0.24,apad=whole_dur=${script.duracao}[bg];[bg][chave]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[bgd];[voz1][bgd]amix=inputs=2:normalize=0,atrim=0:${script.duracao},afade=t=out:st=${script.duracao - 1.5}:d=1.5,loudnorm=I=-16:TP=-1.5:LRA=11[out]`
  : `${voices};${voiceMix};[voz]atrim=0:${script.duracao},loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
const out = rehearsal ? join(work, "ensaio.mp3") : join(outDir, "som.mp3");
execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filter, "-map", "[out]", "-ar", "44100", "-b:a", "128k", out]);
console.log(`\nPronto: ${out.replace(root, "")} (${duration(out).toFixed(2)} s)${existsSync(out) ? "" : " — falhou"}`);
