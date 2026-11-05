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
  lines.push({ file, at: line.at });
}

/* ---------- A música e os efeitos, compostos aqui (sem a Eleven Music, que é paga) ---------- */

// Os instantes da animação (landing/showreel.tsx): mudar lá é mudar aqui.
const CUES = {
  transitions: [6.6, 15, 25, 35, 45],
  impacts: [0.25, 2.3, 49.7],
  clicks: [7.6, 9.4, 10.0, 11.05, 13.4, 38.4],
  typing: [...range(10.15, 10.85, 0.07), ...range(11.15, 11.6, 0.075)],
  pops: [7.7, 9.5, 11.6, 12.7, 13.6, 16.2, 17.4, 18.6, 19.8, 21.0, 22.2, 25.9, 26.4, 26.9, 27.4, 41.0, 41.28, 41.56, 41.84, 42.12],
  checks: [29.2, 30.4, 31.6, 32.8],
  sale: 38.7,
  riser: [45.4, 49.6],
};
function range(a, b, step) {
  const out = [];
  for (let v = a; v <= b + 1e-9; v += step) out.push(+v.toFixed(3));
  return out;
}

const D = script.duracao;
const g = (a, b) => `between(t,${a},${b})`;
const sum = (terms) => (terms.length ? terms.join("+") : "0");
/** O acorde muda de 4 em 4 segundos (dois compassos a 120 BPM): Lá, Fá, Dó, Sol. */
const BAR = "mod(floor(t/4),4)";
const ROOT = `if(lt(${BAR},1),55,if(lt(${BAR},2),43.65,if(lt(${BAR},3),65.41,49)))`;
/** O «bombear» da música ao ritmo do bombo, como na música electrónica. */
const PUMP = `(1-0.55*exp(-9*mod(t,0.5))*${g(6.6, 45)})`;

function lavfi(expr) {
  return ["-f", "lavfi", "-i", `aevalsrc='${expr}':s=44100:d=${D}`];
}

function synthTrack(file) {
  const groove = `(${g(6.6, 45)}+${g(49.7, 54)})`;
  const layers = [
    // Bombo: um seno que desce de tom, a cada tempo.
    `0.95*${groove}*sin(2*PI*(45*mod(t,0.5)+3*(1-exp(-30*mod(t,0.5)))))*exp(-7*mod(t,0.5))`,
    // Hi-hat no contratempo, e a dobrar na subida final.
    `0.22*(${groove}+${g(45, 49.6)})*(random(0)*2-1)*exp(-55*mod(t+0.25,0.5))`,
    // Palmas no 2 e no 4.
    `0.32*(${g(15, 45)}+${g(49.7, 54)})*(random(1)*2-1)*exp(-22*mod(t-0.5,1))`,
    // Baixo em colcheias, na tónica do acorde.
    `0.30*${groove}*(sin(2*PI*${ROOT}*t)+0.5*sin(4*PI*${ROOT}*t)+0.25*sin(6*PI*${ROOT}*t))*exp(-5*mod(t,0.25))*(1-exp(-300*mod(t,0.25)))`,
    // Arpejo em semicolcheias (tónica, quinta, oitava, quinta acima), a crescer na abertura.
    `0.11*(0.25+0.75*min(1,max(0,(t-0.5)/6)))*${g(0, D - 1)}*${PUMP}*sin(2*PI*${ROOT}*4*if(lt(mod(floor(t/0.125),4),1),1,if(lt(mod(floor(t/0.125),4),2),1.5,if(lt(mod(floor(t/0.125),4),3),2,3)))*t)*exp(-13*mod(t,0.125))`,
    // Pad por baixo de tudo.
    `0.07*${PUMP}*(sin(2*PI*${ROOT}*2*t)+sin(2*PI*${ROOT}*3*t)+0.7*sin(2*PI*${ROOT}*4*t))*(0.8+0.2*sin(2*PI*0.25*t))`,
  ];
  const filter = [
    "[0:a]lowpass=f=180[k]",
    "[1:a]highpass=f=7000[h]",
    "[2:a]bandpass=f=1800:width_type=h:w=1600[c]",
    "[3:a]lowpass=f=900[b]",
    "[4:a]lowpass=f=5000[a]",
    "[5:a]lowpass=f=1600,aecho=0.8:0.5:120|260:0.25|0.18[p]",
    `[k][h][c][b][a][p]amix=inputs=6:normalize=0,afade=t=out:st=${D - 2.5}:d=2.5,aformat=channel_layouts=stereo[m]`,
  ].join(";");
  execFileSync("ffmpeg", ["-y", "-v", "error", ...layers.flatMap(lavfi), "-filter_complex", filter, "-map", "[m]", file]);
}

function synthEffects(file) {
  const noise = sum([
    // Whoosh: ruído que sobe e desce à volta de cada mudança de cena.
    ...CUES.transitions.map((T) => `0.9*exp(-pow((t-${T - 0.12})/0.2,2))`),
    // A subida antes do fecho.
    `0.5*${g(...CUES.riser)}*pow((t-${CUES.riser[0]})/${CUES.riser[1] - CUES.riser[0]},2.2)`,
    // Teclas a escrever.
    ...CUES.typing.map((T) => `0.5*${g(T, T + 0.03)}*exp(-140*(t-${T}))`),
    // A cauda dos impactos.
    ...CUES.impacts.map((T) => `0.6*${g(T, T + 0.4)}*exp(-14*(t-${T}))`),
  ]);
  const tones = sum([
    ...CUES.impacts.map((T) => `0.9*${g(T, T + 1.6)}*sin(2*PI*(42*(t-${T})+2*(1-exp(-12*(t-${T})))))*exp(-3.2*(t-${T}))`),
    ...CUES.clicks.map((T) => `0.45*${g(T, T + 0.06)}*sin(2*PI*2600*(t-${T}))*exp(-90*(t-${T}))`),
    ...CUES.pops.map((T) => `0.3*${g(T, T + 0.15)}*sin(2*PI*(700*(t-${T})+30*(1-exp(-30*(t-${T})))))*exp(-26*(t-${T}))`),
    ...CUES.checks.map((T, i) => `0.32*${g(T, T + 0.5)}*sin(2*PI*${[880, 988, 1109, 1319][i]}*(t-${T}))*exp(-9*(t-${T}))`),
    `0.3*${g(CUES.sale, CUES.sale + 0.8)}*sin(2*PI*1319*(t-${CUES.sale}))*exp(-6*(t-${CUES.sale}))`,
    `0.3*${g(CUES.sale + 0.09, CUES.sale + 0.9)}*sin(2*PI*1760*(t-${CUES.sale + 0.09}))*exp(-6*(t-${CUES.sale + 0.09}))`,
    // O tom que sobe com a subida.
    `0.12*${g(...CUES.riser)}*sin(2*PI*(220*(t-${CUES.riser[0]})+60*pow(t-${CUES.riser[0]},2)))*((t-${CUES.riser[0]})/${CUES.riser[1] - CUES.riser[0]})`,
  ]);
  const filter = [
    "[0:a]bandpass=f=1400:width_type=h:w=2600[n]",
    "[n][1:a]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo[e]",
  ].join(";");
  execFileSync("ffmpeg", ["-y", "-v", "error", ...lavfi(`(random(0)*2-1)*(${noise})`), ...lavfi(tones), "-filter_complex", filter, "-map", "[e]", file]);
}

// 2. As falas mais rápidas e sem pausas longas, com mais presença.
const tight = [];
for (const [i, l] of lines.entries()) {
  const file = join(work, `voz-${i}.wav`);
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", l.file, "-af",
    "silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.15:stop_threshold=-42dB:stop_silence=0.07,atempo=1.12,highpass=f=90,equalizer=f=3200:t=q:w=1:g=3,acompressor=threshold=0.12:ratio=3:attack=5:release=90:makeup=1.5",
    file]);
  const next = script.falas[i + 1]?.at ?? D;
  const len = duration(file);
  const room = next - l.at - 0.1;
  console.log(`fala ${i + 1}: ${len.toFixed(2)} s (cabe em ${room.toFixed(2)} s)${len > room ? "  ← passa o tempo: mudar «at» ou encurtar" : ""}`);
  tight.push({ file, at: l.at });
}

// 3. A música (Eleven Music, se o plano a tiver) e os efeitos.
const effects = join(work, "efeitos.wav");
synthEffects(effects);
let music = null;
if (withMusic) {
  music = join(work, "musica.mp3");
  try {
    if (rehearsal) throw new Error("ensaio sem créditos");
    writeFileSync(music, await eleven("/v1/music", { prompt: script.musica, music_length_ms: D * 1000 }));
  } catch (error) {
    console.warn(`Eleven Music indisponível (${error.message.slice(0, 60)}): música composta aqui.`);
    music = join(work, "musica.wav");
    synthTrack(music);
  }
}

// 4. A mistura: a voz por cima, a música a baixar um pouco quando há voz, os efeitos inteiros.
const inputs = [...tight.flatMap((l) => ["-i", l.file]), "-i", effects, ...(music ? ["-i", music] : [])];
const n = tight.length;
const voices = tight
  .map((l, i) => `[${i}:a]adelay=${Math.round(l.at * 1000)}|${Math.round(l.at * 1000)},aformat=channel_layouts=stereo[v${i}]`)
  .join(";");
const voiceMix = `${tight.map((_, i) => `[v${i}]`).join("")}amix=inputs=${n}:normalize=0,apad=whole_dur=${D}[voz]`;
const fx = `[${n}:a]volume=0.55,apad=whole_dur=${D}[fx]`;
const tail = `atrim=0:${D},afade=t=out:st=${D - 1.2}:d=1.2,loudnorm=I=-14:TP=-1.2:LRA=9[out]`;
const filter = music
  ? `${voices};${voiceMix};${fx};[voz]asplit=2[voz1][chave];[${n + 1}:a]volume=0.3,apad=whole_dur=${D}[bg];[bg][chave]sidechaincompress=threshold=0.04:ratio=7:attack=10:release=280[bgd];[voz1][bgd][fx]amix=inputs=3:normalize=0,${tail}`
  : `${voices};${voiceMix};${fx};[voz][fx]amix=inputs=2:normalize=0,${tail}`;
const out = rehearsal ? join(work, "ensaio.mp3") : join(outDir, "som.mp3");
execFileSync("ffmpeg", ["-y", "-v", "error", ...inputs, "-filter_complex", filter, "-map", "[out]", "-ar", "44100", "-b:a", "128k", out]);
console.log(`\nPronto: ${out.replace(root, "")} (${duration(out).toFixed(2)} s)`);
