/**
 * Upload de vídeos para o bucket `webinar-videos` por TUS (resumable).
 *
 * Porque não o upload normal: um vídeo de várias GB numa só ligação HTTP não
 * dá progresso, não retoma e perde tudo à primeira quebra de rede. Com TUS o
 * ficheiro vai em blocos de 6 MB, cada bloco lido do disco na altura (nunca
 * carregamos o ficheiro inteiro para memória), com retoma automática e
 * manual, pausa e cancelamento.
 *
 * Autenticação: o JWT da sessão actual do utilizador, renovado antes de cada
 * pedido, para uploads longos não morrerem quando o token expira. As policies
 * do bucket continuam a mandar: o caminho tem de começar pela organização.
 */
import * as tus from "tus-js-client";

import { supabase } from "@/integrations/supabase/client";

export const VIDEO_BUCKET = "webinar-videos";
/**
 * Limite da aplicação para um vídeo enviado: 20 GB. Chega para qualquer aula gravada em boa qualidade
 * (1080p de 2 h são 2 a 6 GB; 4K comprimido, até ~15 GB). O resumable da Supabase aceita até 50 GB, mas o
 * vídeo é servido tal como foi enviado (sem transcodificação): acima disto pesa a cada espectador e no
 * egress. O limite global do projecto Supabase (Storage › Settings) tem de ser pelo menos este.
 */
export const MAX_VIDEO_BYTES = 20 * 1024 * 1024 * 1024;
/** A partir daqui avisa-se que o ficheiro vai pesar no telemóvel e que vale a pena comprimir. */
export const HEAVY_VIDEO_BYTES = 6 * 1024 * 1024 * 1024;
/** A Supabase exige blocos de 6 MB no endpoint resumable. */
const CHUNK_BYTES = 6 * 1024 * 1024;
const RETRY_DELAYS_MS = [0, 3000, 5000, 10000, 20000, 30000];

export type VideoUploadStatus = "uploading" | "paused" | "error" | "done" | "cancelled";

export type VideoUploadProgress = {
  status: VideoUploadStatus;
  bytesSent: number;
  bytesTotal: number;
  /** 0 a 100, inteiro. */
  percent: number;
  /** Mensagem para o utilizador quando `status` é "error". */
  error: string | null;
  /** Verdadeiro quando o erro permite "Tentar de novo" sem recomeçar do zero. */
  recoverable: boolean;
  /** Bytes já no servidor quando o envio foi retomado de uma sessão anterior. */
  resumedFromBytes: number | null;
};

export type VideoUploadHandle = {
  /** Caminho do objecto no bucket. Pode mudar ao retomar um envio anterior. */
  readonly path: string;
  readonly file: File;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): void;
  cancel(): Promise<void>;
};

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${index === 0 ? value : value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
}

/** Nome de ficheiro aceite pelas regras de nomes do Storage. */
export function safeObjectName(fileName: string): string {
  return fileName.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "video";
}

/**
 * Endpoint resumable no hostname directo de storage, que a Supabase
 * recomenda para ficheiros grandes: `<ref>.storage.supabase.co`.
 */
export function tusEndpoint(): string {
  const raw = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  if (!raw) throw new Error("A ligação ao armazenamento não está configurada.");
  const url = new URL(raw);
  url.hostname = url.hostname.replace(
    /^([a-z0-9-]+)\.supabase\.(co|in|red)$/i,
    (_match, ref: string, tld: string) => `${ref}.storage.supabase.${tld}`,
  );
  return `${url.origin}/storage/v1/upload/resumable`;
}

function publishableKey(): string {
  return (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined) ?? "";
}

async function accessToken(): Promise<string> {
  // Só precisamos do token como credencial; o Storage valida-o no servidor.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("A sessão expirou. Entre novamente para enviar o vídeo.");
  return token;
}

function statusOf(error: unknown): number | null {
  const detailed = error as { originalResponse?: { getStatus?: () => number } | null };
  const status = detailed?.originalResponse?.getStatus?.();
  return typeof status === "number" ? status : null;
}

/** Erros que fazem sentido repetir a partir do ponto em que ficou. */
function isRecoverable(error: unknown): boolean {
  const status = statusOf(error);
  if (status == null) return true; // rede, timeout, ligação cortada
  if (status === 401) return true; // token renovado no pedido seguinte
  return status === 409 || status === 423 || status === 429 || status >= 500;
}

function describe(error: unknown): string {
  const status = statusOf(error);
  if (status === 401) return "A sessão expirou a meio do envio. Entre novamente e retome.";
  if (status === 403) return "Sem permissão para enviar vídeos para esta organização.";
  if (status === 413)
    return "O armazenamento recusou o ficheiro: excede o limite de tamanho configurado no projecto Supabase.";
  if (status === 409) return "Já existe um ficheiro com este nome. Tente outra vez.";
  if (status != null && status >= 500) return "O armazenamento está indisponível. Pode retomar daqui a pouco.";
  if (status == null) return "A ligação falhou a meio. Verifique a Internet e retome o envio.";
  const message = error instanceof Error ? error.message : "";
  return message && message.length < 160 ? message : `O envio falhou (código ${status}).`;
}

export function createVideoUpload(input: {
  file: File;
  /** Caminho pretendido: `<organização>/<uuid>-<nome>`. */
  path: string;
  onProgress: (progress: VideoUploadProgress) => void;
  /** Recebe o caminho real do objecto, que pode ser o de um envio retomado. */
  onSuccess: (path: string) => void;
}): VideoUploadHandle {
  const { file } = input;
  let path = input.path;
  let resumedFromBytes: number | null = null;
  let state: VideoUploadProgress = {
    status: "uploading",
    bytesSent: 0,
    bytesTotal: file.size,
    percent: 0,
    error: null,
    recoverable: false,
    resumedFromBytes: null,
  };
  const emit = (patch: Partial<VideoUploadProgress>) => {
    state = { ...state, ...patch };
    input.onProgress(state);
  };

  const upload = new tus.Upload(file, {
    endpoint: tusEndpoint(),
    chunkSize: CHUNK_BYTES,
    retryDelays: RETRY_DELAYS_MS,
    uploadDataDuringCreation: true,
    storeFingerprintForResuming: true,
    removeFingerprintOnSuccess: true,
    headers: { apikey: publishableKey(), "x-upsert": "false" },
    metadata: {
      bucketName: VIDEO_BUCKET,
      objectName: path,
      contentType: file.type || "video/mp4",
      cacheControl: "3600",
    },
    // Token fresco em cada pedido: um envio de horas sobrevive à expiração.
    onBeforeRequest: async (request) => {
      request.setHeader("authorization", `Bearer ${await accessToken()}`);
    },
    onShouldRetry: (error) => isRecoverable(error),
    onProgress: (bytesSent, bytesTotal) => {
      emit({
        status: "uploading",
        bytesSent,
        bytesTotal,
        percent: bytesTotal > 0 ? Math.min(100, Math.floor((bytesSent / bytesTotal) * 100)) : 0,
        error: null,
        recoverable: false,
        resumedFromBytes,
      });
    },
    onSuccess: () => {
      emit({ status: "done", bytesSent: file.size, percent: 100, error: null, recoverable: false });
      input.onSuccess(path);
    },
    onError: (error) => {
      emit({ status: "error", error: describe(error), recoverable: isRecoverable(error) });
    },
  });

  return {
    get path() {
      return path;
    },
    file,
    async start() {
      // Envio anterior do mesmo ficheiro (nome, tamanho, data) ainda válido no
      // servidor: continuamos de onde ficou, com o caminho desse envio.
      try {
        const previous = await upload.findPreviousUploads();
        const candidate = previous[0];
        if (candidate) {
          const previousPath = candidate.metadata?.["objectName"];
          if (previousPath) path = previousPath;
          upload.resumeFromPreviousUpload(candidate);
          resumedFromBytes = 0;
        }
      } catch {
        // Sem registo local: começa do zero.
      }
      emit({ status: "uploading", resumedFromBytes });
      upload.start();
    },
    async pause() {
      await upload.abort(false);
      emit({ status: "paused" });
    },
    resume() {
      emit({ status: "uploading", error: null, recoverable: false });
      upload.start();
    },
    async cancel() {
      // `true` apaga também o envio parcial no servidor e o registo local.
      await upload.abort(true).catch(() => undefined);
      emit({ status: "cancelled", error: null, recoverable: false });
    },
  };
}
