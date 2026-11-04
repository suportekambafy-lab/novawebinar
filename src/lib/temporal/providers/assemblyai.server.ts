/**
 * Motor principal: AssemblyAI (tempos reais por palavra).
 *
 * Só este ficheiro conhece a API da AssemblyAI. A resposta nativa é convertida
 * para o formato interno normalizado antes de sair daqui.
 */
import type {
  TranscriptionHandle,
  TranscriptionInput,
  TranscriptionProgress,
  TranscriptionProvider,
} from "../provider";
import type { NormalizedWord } from "../types";
import { publicAppUrl } from "@/lib/app-url.server";

const API = "https://api.assemblyai.com/v2";
const MODEL = "universal-2";

type AssemblyWord = {
  text?: string;
  start?: number;
  end?: number;
  confidence?: number;
  speaker?: string | null;
};

type AssemblyTranscript = {
  id?: string;
  status?: "queued" | "processing" | "completed" | "error";
  text?: string | null;
  audio_duration?: number | null;
  error?: string | null;
  words?: AssemblyWord[] | null;
};

function key(): string | null {
  return process.env["ASSEMBLYAI_API_KEY"] ?? null;
}

async function request(path: string, init?: RequestInit): Promise<AssemblyTranscript> {
  const token = key();
  if (!token) throw new Error("A transcrição com tempos por palavra não está configurada.");
  const response = await fetch(`${API}${path}`, {
    // Sem resposta num minuto, o pedido falha e a etapa repete mais tarde.
    signal: AbortSignal.timeout(60_000),
    ...init,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as AssemblyTranscript;
  if (!response.ok) {
    throw new Error(body.error || `O serviço de transcrição respondeu ${response.status}.`);
  }
  return body;
}

/**
 * O ficheiro que a AssemblyAI vai buscar. Uma biblioteca do Bunny com referrers permitidos responde
 * 403 a quem não diz de onde vem, e a AssemblyAI não envia Referer: aí o servidor descarrega com o
 * endereço do site e entrega o ficheiro à AssemblyAI. Usa-se o MP4 mais leve: o áudio e os tempos
 * são os mesmos em todas as resoluções.
 */
export async function audioUrlFor(mediaUrl: string, referer: string, upload: (body: ReadableStream<Uint8Array>) => Promise<string>): Promise<string> {
  const probe = await fetch(mediaUrl, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  await probe?.body?.cancel().catch(() => {});
  if (!probe || probe.status !== 403 || !referer) return mediaUrl;

  const lighter = mediaUrl.replace(/\/play_\d+p\.mp4$/, "/play_240p.mp4");
  for (const url of lighter === mediaUrl ? [mediaUrl] : [lighter, mediaUrl]) {
    const response = await fetch(url, { headers: { Referer: `${referer}/` }, signal: AbortSignal.timeout(240_000) });
    if (response.ok && response.body) return upload(response.body);
    await response.body?.cancel().catch(() => {});
  }
  throw new Error("O servidor do vídeo recusou o acesso (403). Confirme na biblioteca do Bunny que o site está nos referrers permitidos.");
}

async function uploadToAssembly(body: ReadableStream<Uint8Array>): Promise<string> {
  const response = await fetch(`${API}/upload`, {
    method: "POST",
    headers: { Authorization: key() ?? "", "Content-Type": "application/octet-stream" },
    body,
    // O Node exige isto para enviar um corpo em fluxo.
    duplex: "half",
    signal: AbortSignal.timeout(240_000),
  } as RequestInit);
  const result = (await response.json().catch(() => ({}))) as { upload_url?: string; error?: string };
  if (!response.ok || !result.upload_url) {
    throw new Error(result.error || `O envio do vídeo para a transcrição falhou (${response.status}).`);
  }
  return result.upload_url;
}

/** Resposta nativa → formato interno normalizado. */
function normalizeWords(words: AssemblyWord[]): NormalizedWord[] {
  return words
    .filter((word) => typeof word.text === "string" && word.text.trim().length > 0)
    .map((word) => ({
      word: word.text!.trim(),
      startMs: Math.max(0, Math.round(word.start ?? 0)),
      endMs: Math.max(0, Math.round(word.end ?? word.start ?? 0)),
      confidence: typeof word.confidence === "number" ? word.confidence : null,
      speakerId: word.speaker ? String(word.speaker) : null,
    }))
    .sort((a, b) => a.startMs - b.startMs);
}

export const assemblyAiProvider: TranscriptionProvider = {
  id: "assemblyai",
  model: MODEL,
  precision: "word",

  isAvailable() {
    return Boolean(key());
  },

  async start(input: TranscriptionInput): Promise<TranscriptionHandle> {
    if (!key()) throw new Error("A transcrição com tempos por palavra não está configurada.");
    const audioUrl = await audioUrlFor(input.mediaUrl, publicAppUrl(), uploadToAssembly);
    const created = await request("/transcript", {
      method: "POST",
      body: JSON.stringify({
        audio_url: audioUrl,
        speech_models: [MODEL],
        language_code: input.language,
        speaker_labels: true,
        punctuate: true,
        format_text: true,
      }),
    });
    if (!created.id) throw new Error("O serviço de transcrição não devolveu o trabalho.");
    return { provider: "assemblyai", jobId: created.id, state: {} };
  },

  async poll(handle: TranscriptionHandle, input: TranscriptionInput): Promise<TranscriptionProgress> {
    if (!handle.jobId) return { status: "failed", reason: "Trabalho de transcrição sem referência." };
    const current = await request(`/transcript/${handle.jobId}`);

    if (current.status === "error") {
      return { status: "failed", reason: current.error || "A transcrição falhou no fornecedor." };
    }

    if (current.status !== "completed") {
      return {
        status: "running",
        handle,
        note: "A transcrever o webinar com tempos por palavra...",
        progress: current.status === "processing" ? 45 : 15,
      };
    }

    const words = normalizeWords(current.words ?? []);
    if (words.length === 0) {
      return { status: "failed", reason: "A transcrição voltou sem palavras com tempo." };
    }

    const durationMs = Math.max(
      Math.round((current.audio_duration ?? 0) * 1000),
      words[words.length - 1]!.endMs,
      Math.round(input.durationSeconds * 1000),
    );

    return {
      status: "done",
      result: {
        provider: "assemblyai",
        providerModel: MODEL,
        precision: "word",
        durationMs,
        rawText: (current.text ?? "").trim(),
        words,
        blocks: [],
      },
    };
  },
};
