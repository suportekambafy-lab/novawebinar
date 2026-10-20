import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  FileText,
  Film,
  Heart,
  Link2,
  Loader2,
  Mic,
  RectangleVertical,
  Upload,
  Video as VideoIcon,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PaneHeader, PanelDialog, PanelNavButton, PanelNavGroup, PanelSection, PanelTitle } from "@/components/panel-modal";
import { VideoThumb } from "@/components/video-thumb";
import { cn } from "@/lib/utils";
import { clock } from "@/lib/room-logic";
import { formatBytes, type VideoUploadProgress } from "@/lib/video-upload";
import type { Appearance } from "@/components/room/room-parts";
import { ROOM_FORMATS, type LiveSettings, type RoomFormat } from "@/lib/room-logic";
import { RoomOptions } from "../room-options";
import { CountPill, Note, Section, SwitchRow, TimeChip } from "../ui";

export type VideoSourceLite = {
  id: string;
  name: string;
  provider: string;
  source_url: string | null;
  duration_seconds: number;
  thumbnail_url?: string | null | undefined;
};

export type EditorClock = {
  t: number;
  duration: number;
  playing: boolean;
  toggle: () => void;
  seek: (seconds: number) => void;
};

type Platform = "vimeo" | "panda" | "bunny";
type Source = "computer" | "library" | "platform" | "link";

export type VideoUploadApi = {
  state: { file: File; progress: VideoUploadProgress } | null;
  busy: boolean;
  start: (file: File) => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
};

/**
 * Vídeo: carregar o vídeo, escolher o formato da sala (Webinar ou Live) e, depois, personalizar a
 * sala da mesma maneira nos dois formatos. A transcrição fica no fim.
 */
export function StepVideo({
  video,
  library,
  providerLabel,
  clock: c,
  transcript,
  onPick,
  upload,
  onAddLink,
  appearance,
  onAppearance,
  format,
  onFormat,
  live,
  onLive,
  backgroundUpload,
}: {
  video: VideoSourceLite | null;
  library: readonly VideoSourceLite[];
  providerLabel: (provider: string) => string;
  clock: EditorClock;
  transcript: readonly { at: number; text: string }[];
  onPick: (id: string) => void;
  upload: VideoUploadApi;
  onAddLink: (input: { name: string; provider: "hls" | Platform; url: string }) => Promise<boolean>;
  appearance: Appearance;
  onAppearance: (appearance: Appearance) => void;
  /** Webinar (vídeo deitado, chat ao lado) ou Live (vídeo com o chat por cima). */
  format: RoomFormat;
  onFormat: (format: RoomFormat) => void;
  live: LiveSettings;
  onLive: (patch: Partial<LiveSettings>) => void;
  /** A imagem de fundo da contagem: o envio reduz-a e grava o endereço em `live.countdown.background`. */
  backgroundUpload: { uploading: boolean; onFile: (file: File) => void };
}) {
  const [dialog, setDialog] = useState(false);
  const [full, setFull] = useState(false);
  let index = -1;
  transcript.forEach((s, i) => {
    if (s.at <= c.t) index = i;
  });
  const around = transcript.slice(Math.max(0, index - 1), Math.max(0, index - 1) + 3);

  return (
    <>
      {upload.state && upload.state.progress.status !== "done" ? (
        <section className="pb-[18px]">
          <UploadCard upload={upload} />
        </section>
      ) : null}
      {!video ? (
        <section className="pb-[18px]">
          <button
            type="button"
            onClick={() => setDialog(true)}
            className="grid w-full place-items-center gap-2 rounded-2xl border-2 border-dashed bg-white px-5 py-9 text-center transition hover:border-foreground/40 hover:bg-gray-50"
          >
            <span className="grid size-12 place-items-center rounded-full bg-foreground text-background">
              <Upload className="size-5" />
            </span>
            <b className="text-[15px] font-semibold">Carregar vídeo</b>
            <span className="max-w-[260px] text-[13px] text-muted-foreground">
              Do computador, da Biblioteca, do Vimeo, Panda ou Bunny, ou por link.
            </span>
          </button>
          <p className="mt-3 text-[12.5px] text-muted-foreground">
            Tudo na sala segue o tempo do vídeo: o chat, a audiência, a oferta e as vendas.
          </p>
        </section>
      ) : (
        <section className="grid grid-cols-[minmax(0,1fr)] gap-3 pb-[18px]">
          {/* O ficheiro escolhido, com a capa (uma imagem do meio do vídeo, não o primeiro fotograma).
              O play e o tempo ficam por baixo da sala, à direita. */}
          <div className="flex items-center gap-3 rounded-xl border bg-white p-2.5">
            <VideoThumb
              name={video.name}
              thumbnailUrl={video.thumbnail_url}
              sourceUrl={video.source_url}
              at={video.duration_seconds * 0.15}
              overlay={false}
              className="w-[88px] shrink-0 rounded-md"
            />
            <div className="min-w-0 flex-1">
              <b className="block truncate text-sm font-semibold">{video.name}</b>
              <span className="text-[12.5px] text-muted-foreground">
                {clock(video.duration_seconds)} · {providerLabel(video.provider)}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={() => setDialog(true)}>
              Trocar
            </Button>
          </div>
        </section>
      )}

      <Section icon={RectangleVertical} title="Formato da sala" help="formato">
        <div
          className="grid gap-2.5"
          style={{ gridTemplateColumns: `repeat(${ROOM_FORMATS.length}, minmax(0, 150px))` }}
          role="radiogroup"
          aria-label="Formato da sala"
        >
          {ROOM_FORMATS.map(({ id: value, name: label, hint: sub }) => {
            const on = format === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onFormat(value)}
                className="group grid content-start gap-1.5 text-left"
              >
                <span
                  className={cn(
                    "relative block aspect-[2/1] overflow-hidden rounded-xl ring-1 ring-black/10 transition",
                    on ? "ring-2 ring-foreground ring-offset-2" : "group-hover:ring-black/25",
                  )}
                >
                  {FORMAT_THUMB[value]()}
                  {on ? (
                    <span className="absolute right-1.5 top-1.5 grid size-[18px] place-items-center rounded-full bg-foreground text-background">
                      <Check className="size-3" />
                    </span>
                  ) : null}
                </span>
                <span className="grid leading-tight">
                  <span className={cn("text-[13px]", on ? "font-semibold" : "font-medium text-muted-foreground")}>{label}</span>
                  <span className="text-[11.5px] text-muted-foreground">{sub}</span>
                </span>
              </button>
            );
          })}
        </div>
        {/* Webinar: o bloco de cima (título, «Sessão ao vivo», quem apresenta) é opcional. No Live, o nome
            de quem apresenta já está na barra por cima do vídeo. */}
        {format === "webinar" ? (
          <div className="rounded-xl border bg-white p-3">
            <SwitchRow
              title="Título e apresentador"
              description={live.header ? "Por baixo do vídeo, antes do chat." : "Só o vídeo, o chat, o Suporte e a oferta."}
              checked={live.header}
              onChange={(header) => onLive({ header })}
            />
          </div>
        ) : null}
        {format === "webinar" ? (
          <div className="rounded-xl border bg-white p-3">
            <SwitchRow
              title="Botão de ecrã inteiro"
              description="No telemóvel, com vídeo horizontal: um botão para ver deitado, em ecrã inteiro."
              checked={live.fullscreenButton}
              onChange={(fullscreenButton) => onLive({ fullscreenButton })}
            />
          </div>
        ) : null}
      </Section>
      <RoomOptions
        live={live}
        onLive={onLive}
        appearance={appearance}
        onAppearance={onAppearance}
        clock={c}
        transcript={transcript}
        library={library}
        providerLabel={providerLabel}
        backgroundUpload={backgroundUpload}
      />

      {video ? (
        <Section icon={Mic} title="Transcrição" help="transcricao" aside={transcript.length ? <CountPill>{transcript.length} frases</CountPill> : null}>
          {transcript.length === 0 ? (
            <Note icon={FileText}>
              Ainda sem transcrição. Ao criar os comentários no Chat, o sistema transcreve a fala e encontra os momentos do vídeo.
            </Note>
          ) : (
            <>
              <div className="divide-y overflow-hidden rounded-xl border bg-white">
                {around.map((s) => (
                  <SentenceRow key={s.at} at={s.at} text={s.text} active={s === transcript[index]} onSeek={c.seek} clamp />
                ))}
              </div>
              <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setFull(true)}>
                <FileText />
                Ver a transcrição completa
              </Button>
            </>
          )}
        </Section>
      ) : null}

      {dialog ? (
        <SourceDialog
          onClose={() => setDialog(false)}
          library={library}
          current={video?.id ?? null}
          providerLabel={providerLabel}
          onPick={(id) => {
            onPick(id);
            setDialog(false);
          }}
          upload={upload}
          onAddLink={async (input) => {
            const ok = await onAddLink(input);
            if (ok) setDialog(false);
            return ok;
          }}
        />
      ) : null}

      {/* A transcrição completa abre ao lado: a sala continua à vista. */}
      <Sheet open={full} onOpenChange={setFull}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[440px]">
          <SheetHeader className="border-b px-5 py-4 text-left">
            <SheetTitle className="text-base font-semibold">Transcrição</SheetTitle>
            <SheetDescription>{transcript.length} frases. Clique numa frase para a sala ir a esse minuto.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 divide-y overflow-y-auto">
            {transcript.map((line, i) => (
              <SentenceRow key={line.at} at={line.at} text={line.text} active={i === index} onSeek={(t) => c.seek(t)} />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Um comentário em miniatura: o avatar e a linha do texto. */
function ThumbLine({ w, tone = "bg-white/30" }: { w: number; tone?: string }) {
  return (
    <span className="flex items-center gap-[3px]">
      <i className="block size-[5px] shrink-0 rounded-full bg-white/45" />
      <i className={cn("block h-[3px] rounded-full", tone)} style={{ width: `${w}%` }} />
    </span>
  );
}

/**
 * Cada formato em miniatura. Um formato novo (ex.: um tipo Zoom) só precisa da sua entrada aqui e
 * em ROOM_FORMATS; a grelha dos cartões ajusta-se ao número de formatos.
 */
export const FORMAT_THUMB: Record<RoomFormat, () => ReactNode> = {
  // Webinar, como o YouTube: o leitor deitado com o play e a barra, o título por baixo e o chat ao lado.
  webinar: () => (
    <span className="grid h-full grid-cols-[1fr_32%] gap-1 bg-[#0F0F0F] p-1.5">
      <span className="grid content-start gap-1">
        <span className="relative grid aspect-video place-items-center overflow-hidden rounded-[3px] bg-[linear-gradient(160deg,#4B5160,#272A31)]">
          <i className="ml-px block size-0 border-y-[5px] border-l-[8px] border-y-transparent border-l-white/90" />
          <i className="absolute inset-x-0 bottom-0 block h-[2px] bg-white/20">
            <i className="block h-full w-2/5 bg-[#FF0033]" />
          </i>
        </span>
        <i className="block h-[3px] w-4/5 rounded-full bg-white/40" />
        <i className="block h-[3px] w-1/2 rounded-full bg-white/20" />
      </span>
      <span className="grid content-end gap-[4px] rounded-[3px] bg-[#212121] p-1">
        <ThumbLine w={70} />
        <ThumbLine w={50} />
        <ThumbLine w={62} />
        <i className="mt-px block h-[7px] rounded-full ring-1 ring-white/25" />
      </span>
    </span>
  ),
  // Live, como o Instagram: o ecrã ao alto, com quem apresenta e o AO VIVO em cima e o chat por cima do vídeo.
  live: () => (
    <span className="grid h-full place-items-center bg-[#0F0F0F] py-1">
      <span className="relative block h-full aspect-[9/16] overflow-hidden rounded-[5px] bg-[linear-gradient(170deg,#6B7280,#2A2F38_75%)]">
        <span className="absolute inset-x-[3px] top-[3px] flex items-center gap-[2px]">
          <i className="block size-[5px] shrink-0 rounded-full bg-white/80" />
          <i className="block h-[4px] w-[9px] rounded-[1px] bg-[#E5243B]" />
        </span>
        <span className="absolute inset-x-[3px] bottom-[3px] grid gap-[3px]">
          <ThumbLine w={60} tone="bg-white/75" />
          <ThumbLine w={45} tone="bg-white/75" />
          <span className="flex items-center gap-[2px]">
            <i className="block h-[6px] flex-1 rounded-full ring-1 ring-white/60" />
            <Heart className="size-[7px] shrink-0 fill-[#FF4233] text-[#FF4233]" />
          </span>
        </span>
      </span>
    </span>
  ),
};

function SentenceRow({
  at,
  text,
  active,
  onSeek,
  clamp,
}: {
  at: number;
  text: string;
  active: boolean;
  onSeek: (t: number) => void;
  clamp?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onSeek(at)}
      className={cn(
        "flex w-full items-start gap-2.5 px-3 py-2 text-left text-[13px] leading-snug",
        active ? "bg-[#FDE4D9] text-foreground" : "text-muted-foreground hover:bg-gray-50",
      )}
    >
      <TimeChip seconds={at} active={active} />
      <span className={clamp ? "line-clamp-2" : undefined}>{text}</span>
    </button>
  );
}


/* ---------- Carregar vídeo ---------- */

const PLATFORMS: Record<
  Platform,
  { name: string; domain: string; color: string; text: string; where: string[]; example: string; test: RegExp }
> = {
  vimeo: {
    name: "Vimeo",
    domain: "vimeo.com",
    color: "#1AB7EA",
    text: "Cole o link do vídeo (vimeo.com/…).",
    where: ["Abra o vídeo no Vimeo.", "Carregue em «Partilhar».", "Copie o link do vídeo e cole-o aqui."],
    example: "https://vimeo.com/123456789",
    test: /vimeo\.com\//i,
  },
  panda: {
    name: "Panda Video",
    domain: "pandavideo.com.br",
    color: "#111827",
    text: "Cole o link do player (…/embed/?v=…).",
    where: ["Abra o vídeo no painel do Panda Video.", "Em «Incorporar», copie o link do player.", "Cole-o aqui (acaba em ?v=…)."],
    example: "https://player-vz-xxxx.tv.pandavideo.com.br/embed/?v=…",
    test: /pandavideo/i,
  },
  bunny: {
    name: "Bunny Stream",
    domain: "bunny.net",
    color: "#FF7B2F",
    text: "Cole o «HLS Playlist URL» (…/playlist.m3u8).",
    where: ["Abra o vídeo na biblioteca do Bunny Stream.", "Copie o «HLS Playlist URL» (acaba em .m3u8).", "Cole-o aqui."],
    example: "https://vz-xxxx.b-cdn.net/…/playlist.m3u8",
    test: /b-cdn\.net|mediadelivery\.net/i,
  },
};

/** O envio do ficheiro: o nome, a percentagem, a barra e quanto já foi, com pausar, retomar e cancelar. */
function UploadCard({ upload }: { upload: VideoUploadApi }) {
  if (!upload.state) return null;
  const p = upload.state.progress;
  const state =
    p.status === "paused" ? "Em pausa" : p.status === "error" ? (p.error ?? "O envio falhou") : p.status === "cancelled" ? "Cancelado" : "A carregar";
  return (
    <div className="grid gap-2.5 rounded-xl border bg-white p-3.5" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-chip">
          {p.status === "uploading" ? <Loader2 className="size-[18px] animate-spin" /> : <Upload className="size-[18px]" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{upload.state.file.name}</p>
          <p className={cn("text-[12px]", p.status === "error" ? "text-destructive" : "text-muted-foreground")}>
            {state} · {formatBytes(p.bytesSent)} de {formatBytes(p.bytesTotal)}
          </p>
        </div>
        <span className="font-mono text-[15px] font-semibold tabular-nums">{p.percent}%</span>
      </div>
      <Progress value={p.percent} />
      <div className="flex flex-wrap gap-2">
        {p.status === "uploading" ? (
          <Button variant="outline" size="sm" onClick={upload.pause}>
            Pausar
          </Button>
        ) : null}
        {p.status === "paused" || (p.status === "error" && p.recoverable) ? (
          <Button size="sm" variant="dark" onClick={upload.resume}>
            Retomar
          </Button>
        ) : null}
        {p.status !== "cancelled" ? (
          <Button variant="ghost" size="sm" onClick={upload.cancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** O logótipo da plataforma num mosaico branco, como nas Integrações. */
function PlatformLogo({ platform, size = 40 }: { platform: Platform; size?: number }) {
  const [failed, setFailed] = useState(false);
  const p = PLATFORMS[platform];
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--border-card)] bg-white"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {failed ? (
        <span className="grid size-[70%] place-items-center rounded-md font-black text-white" style={{ background: p.color, fontSize: size * 0.4 }}>
          {p.name[0]}
        </span>
      ) : (
        <img
          src={`https://www.google.com/s2/favicons?domain=${p.domain}&sz=128`}
          alt=""
          className="size-[62%] object-contain"
          draggable={false}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

const SOURCES: { key: Source; icon: LucideIcon; title: string; text: string }[] = [
  { key: "computer", icon: Upload, title: "Do computador", text: "MP4 ou MOV em H.264, até 20 GB" },
  { key: "library", icon: Film, title: "Da Biblioteca", text: "Os vídeos que já carregou" },
  { key: "platform", icon: VideoIcon, title: "De uma plataforma", text: "Vimeo, Panda Video, Bunny" },
  { key: "link", icon: Link2, title: "Por link", text: "Um ficheiro MP4 ou uma lista HLS" },
];

/** Os vídeos da Biblioteca, com a capa e a duração; o escolhido leva «Em uso». Serve o vídeo da aula e o da espera. */
export function LibraryGrid({
  library,
  current,
  providerLabel,
  onPick,
}: {
  library: readonly VideoSourceLite[];
  current: string | null;
  providerLabel: (provider: string) => string;
  onPick: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {library.map((v) => {
        const on = current === v.id;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onPick(v.id)}
            className={cn(
              "group grid content-start overflow-hidden rounded-xl border border-hairline bg-white text-left transition hover:shadow-[var(--shadow-raised)]",
              on && "ring-2 ring-foreground",
            )}
          >
            <span className="relative">
              <VideoThumb name={v.name} thumbnailUrl={v.thumbnail_url} sourceUrl={v.source_url} overlay={false} />
              <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-px font-mono text-[11px] font-medium tabular-nums text-white">
                {clock(v.duration_seconds)}
              </span>
              {on ? (
                <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">
                  <Check className="size-3" />
                  Em uso
                </span>
              ) : null}
            </span>
            <span className="grid gap-0.5 px-3 py-2.5">
              <b className="line-clamp-2 text-[13px] font-medium leading-snug">{v.name}</b>
              <span className="text-[12px] text-muted-foreground">{providerLabel(v.provider)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** O pop-up «Carregar vídeo», com a moldura das Integrações: o menu à esquerda e o conteúdo à direita. */
function SourceDialog({
  onClose,
  library,
  current,
  providerLabel,
  onPick,
  upload,
  onAddLink,
}: {
  onClose: () => void;
  library: readonly VideoSourceLite[];
  current: string | null;
  providerLabel: (provider: string) => string;
  onPick: (id: string) => void;
  upload: VideoUploadApi;
  onAddLink: (input: { name: string; provider: "hls" | Platform; url: string }) => Promise<boolean>;
}) {
  const [source, setSource] = useState<Source>(library.length ? "library" : "computer");
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setUrl("");
    setName("");
  }, [source, platform]);
  const linkProblem = (() => {
    const value = url.trim();
    if (!value) return null;
    if (!/^https?:\/\/.+/i.test(value)) return "O link começa por https://";
    if (/youtube\.com|youtu\.be/i.test(value))
      return "O YouTube não serve: mostra os controlos e as sugestões dele por cima da aula. Use o Vimeo, o Panda, o Bunny ou o ficheiro.";
    if (source === "platform" && platform && !PLATFORMS[platform].test.test(value))
      return `Este link não parece do ${PLATFORMS[platform].name}. Exemplo: ${PLATFORMS[platform].example}`;
    if (source === "link" && !/\.(mp4|mov|m4v|webm|m3u8)(\?|$)/i.test(value))
      return "O link tem de ir direto ao ficheiro (.mp4 ou .mov) ou à lista HLS (.m3u8).";
    return null;
  })();
  const submit = async () => {
    setSaving(true);
    try {
      await onAddLink({
        name: name.trim() || (source === "platform" && platform ? `Vídeo do ${PLATFORMS[platform].name}` : "Vídeo do webinar"),
        provider: source === "platform" && platform ? platform : "hls",
        url: url.trim(),
      });
    } finally {
      setSaving(false);
    }
  };
  const go = (key: Source) => {
    setSource(key);
    setPlatform(null);
  };
  const nav = (s: (typeof SOURCES)[number]) => (
    <PanelNavButton key={s.key} icon={s.icon} label={s.title} active={source === s.key} onClick={() => go(s.key)} />
  );
  const linkForm = (placeholder: string) => (
    <PanelSection title="Link do vídeo">
      <label className="grid gap-1.5 text-[13px] font-medium text-foreground">
        Link
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={placeholder} autoFocus />
      </label>
      {linkProblem ? <p className="text-[12.5px] text-warning">{linkProblem}</p> : null}
      <label className="grid gap-1.5 text-[13px] font-medium text-foreground">
        <span>
          Nome na Biblioteca <span className="font-normal text-muted-foreground">· opcional</span>
        </span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Aula de lançamento" />
      </label>
      <div className="flex justify-end">
        <Button variant="dark" disabled={saving || !url.trim() || Boolean(linkProblem)} onClick={() => void submit()}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Usar este vídeo
        </Button>
      </div>
    </PanelSection>
  );

  let content: ReactNode;
  if (source === "computer") {
    content = (
      <>
        <PaneHeader title="Do computador" subtitle="MP4 ou MOV em H.264, até 20 GB. O envio continua se a ligação cair. Para tocar bem no telemóvel: 1080p a 4–6 Mbit/s (HEVC/H.265 não é aceite: não toca em muitos navegadores)." />
        <button
          type="button"
          disabled={upload.busy}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) upload.start(file);
          }}
          className="grid w-full place-items-center gap-2 rounded-xl border-2 border-dashed border-hairline bg-white px-4 py-12 text-center transition hover:border-foreground/40 disabled:opacity-60"
        >
          <span className="grid size-11 place-items-center rounded-full bg-chip">
            <Upload className="size-5" />
          </span>
          <b className="text-[15px] font-semibold">Arraste o vídeo para aqui</b>
          <span className="text-[13px] text-muted-foreground">ou clique para escolher do computador</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.start(file);
            e.target.value = "";
          }}
        />
        {upload.state && upload.state.progress.status !== "done" ? (
          <div className="mt-4">
            <UploadCard upload={upload} />
          </div>
        ) : null}
        <p className="mt-3 text-[12.5px] text-muted-foreground">Quando acabar, o vídeo fica escolhido e guardado na Biblioteca.</p>
      </>
    );
  } else if (source === "library") {
    content = (
      <>
        <PaneHeader
          title="Da Biblioteca"
          subtitle={library.length ? `${library.length} ${library.length === 1 ? "vídeo" : "vídeos"}. Escolha o vídeo deste webinar.` : undefined}
        />
        {library.length === 0 ? (
          <Note icon={Film}>A Biblioteca ainda está vazia. Carregue o primeiro vídeo do computador ou de uma plataforma.</Note>
        ) : (
          <LibraryGrid library={library} current={current} providerLabel={providerLabel} onPick={onPick} />
        )}
      </>
    );
  } else if (source === "platform") {
    content = platform ? (
      <>
        <PaneHeader title={PLATFORMS[platform].name} subtitle={PLATFORMS[platform].text} onBack={() => setPlatform(null)} />
        <PanelSection title="Onde está o link">
          <ol className="grid gap-2">
            {PLATFORMS[platform].where.map((line, i) => (
              <li key={line} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-chip text-[12px] font-semibold">{i + 1}</span>
                <span className="pt-0.5">{line}</span>
              </li>
            ))}
          </ol>
        </PanelSection>
        <div className="mt-7">{linkForm(PLATFORMS[platform].example)}</div>
      </>
    ) : (
      <>
        <PaneHeader title="De uma plataforma" subtitle="O vídeo fica onde está; a sala toca-o com o leitor da plataforma." />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(Object.keys(PLATFORMS) as Platform[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setPlatform(key)}
              className="flex h-[76px] w-full items-center gap-3.5 rounded-xl border border-hairline bg-white px-4 text-left transition-shadow hover:shadow-[var(--shadow-raised)]"
            >
              <PlatformLogo platform={key} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-foreground">{PLATFORMS[key].name}</span>
                <span className="block truncate text-[12.5px] text-muted-foreground">{PLATFORMS[key].domain}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-gray-600" aria-hidden />
            </button>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] text-muted-foreground">
          O YouTube não está na lista: mostra os controlos e as sugestões dele por cima da aula.
        </p>
      </>
    );
  } else {
    content = (
      <>
        <PaneHeader title="Por link" subtitle="Um vídeo que já está na internet, sem plataforma." />
        <PanelSection title="Que links funcionam">
          <ul className="grid gap-2">
            {(
              [
                [true, "Um ficheiro na internet", "termina em .mp4 ou .mov"],
                [true, "Uma lista HLS", "termina em .m3u8 (Bunny, Cloudflare, Mux…)"],
                [false, "YouTube", "mostra os controlos e as sugestões dele por cima da aula"],
              ] as const
            ).map(([ok, title, text]) => (
              <li key={title} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                    ok ? "bg-success-soft text-success" : "bg-[#FDE8E8] text-[#C62828]",
                  )}
                >
                  {ok ? <Check className="size-3" /> : <X className="size-3" />}
                </span>
                <span>
                  <b className="font-medium text-foreground">{title}</b> <span className="text-muted-foreground">· {text}</span>
                </span>
              </li>
            ))}
          </ul>
        </PanelSection>
        <div className="mt-7">{linkForm("https://…/video.mp4 ou …/playlist.m3u8")}</div>
      </>
    );
  }

  return (
    <PanelDialog
      title="Carregar vídeo"
      description="Do computador, da Biblioteca, de uma plataforma ou por link."
      onClose={onClose}
      sidebar={
        <>
          <PanelTitle>Carregar vídeo</PanelTitle>
          <PanelNavGroup>{SOURCES.map(nav)}</PanelNavGroup>
        </>
      }
      mobileNav={SOURCES.map(nav)}
    >
      {content}
    </PanelDialog>
  );
}
