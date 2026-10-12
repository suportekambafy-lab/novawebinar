import { friendlyError } from "@/lib/friendly-error";
import { useEffect, useState } from "react";
import { Check, Copy, FileText, Loader2, RefreshCw, Wand2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { generateEngagementComments } from "@/lib/ai-comments.functions";
import { getTranscriptInspection } from "@/lib/temporal/inspect.functions";
import { TranscriptWords } from "@/components/transcript-words";
import { AiCommentsReview } from "@/components/ai-comments-review";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AI_JOB_STAGES,
  defaultAiSettings,
  dismissAiJob,
  setAiJobDrafts,
  startAiJob,
  useAiJob,
  type AiSettings,
  type DraftComment,
  type TranscriptSegment,
} from "@/lib/ai-comment-jobs";

export { defaultAiSettings };
export type { AiSettings, DraftComment, TranscriptSegment };

function clock(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.max(0, Math.round(seconds)) % 60).padStart(2, "0")}`;
}

function toSeconds(value: string) {
  const [minutes, secs] = value.split(":");
  const m = Number(minutes);
  const s = Number(secs ?? 0);
  if (Number.isNaN(m) || Number.isNaN(s)) return null;
  return m * 60 + s;
}

export function AiCommentsDialog({
  open,
  onOpenChange,
  webinarId,
  webinarTitle = "",
  existing,
  range,
  replaceAll,
  transcript,
  mediaUrl,
  onSeek,
  onTranscript,
  onInsert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webinarId: string;
  webinarTitle?: string;
  existing: { at: number; author: string; message: string }[];
  /** Trecho a cobrir. Sem trecho, cobre o webinar inteiro. */
  range?: { start: number; end: number };
  /** Quando verdadeiro, avisa que a timeline atual vai ser substituída. */
  replaceAll?: boolean;
  transcript: TranscriptSegment[];
  /** Endereço do vídeo, para ouvir a palavra escolhida. */
  mediaUrl?: string | null;
  onSeek?: (seconds: number) => void;
  onTranscript: (segments: TranscriptSegment[]) => void;
  onInsert: (comments: DraftComment[], replaceAll: boolean) => Promise<void>;
}) {
  const job = useAiJob(webinarId);
  const [settings, setSettings] = useState<AiSettings>(defaultAiSettings);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const loadInspection = useServerFn(getTranscriptInspection);
  const inspectionQuery = useQuery({
    queryKey: ["transcript-inspection", webinarId, job?.status ?? "idle"],
    queryFn: () => loadInspection({ data: { webinarId } }),
    enabled: open && (showTranscript || job?.status === "ready"),
  });
  const inspection = inspectionQuery.data ?? null;

  const drafts = job?.drafts ?? null;
  const running = job?.status === "running";
  // A transcrição em curso vem do trabalho; fora dele, a que já está guardada.
  const lines = job?.transcript?.length ? job.transcript : transcript;
  const lastAt = lines.length ? (lines[lines.length - 1]?.at ?? 0) : 0;

  useEffect(() => {
    if (open && job?.settings) setSettings(job.settings);
    // só quando o diálogo abre
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (job?.status === "error" && job.error) toast.error(job.error);
  }, [job?.status, job?.error]);

  const run = () => {
    startAiJob({
      webinarId,
      webinarTitle,
      settings,
      transcript,
      existing,
      replaceAll: Boolean(replaceAll),
      ...(range ? { range } : {}),
      onTranscript,
    });
  };

  const regenerateOne = async (index: number) => {
    if (!drafts) return;
    const target = drafts[index];
    if (!target) return;
    setBusy(true);
    try {
      const result = await generateEngagementComments({
        data: {
          webinarId,
          settings,
          transcript,
          range: { start: Math.max(0, target.at - 20), end: target.at + 20 },
          existing: drafts.filter((_, i) => i !== index),
          count: 1,
        },
      });
      const next = result.comments[0];
      if (next)
        setAiJobDrafts(
          webinarId,
          drafts.map((c, i) => (i === index ? { ...next, at: target.at } : c)),
        );
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível regenerar."));
    } finally {
      setBusy(false);
    }
  };

  const insert = async () => {
    if (!drafts?.length) return;
    setSaving(true);
    try {
      await onInsert(drafts, Boolean(job?.replaceAll ?? replaceAll));
      dismissAiJob(webinarId);
      onOpenChange(false);
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível aprovar os comentários."));
    } finally {
      setSaving(false);
    }
  };

  const reject = () => {
    if (
      !window.confirm(
        "Rejeitar este chat gerado? Os comentários ainda não publicados serão eliminados.",
      )
    )
      return;
    dismissAiJob(webinarId);
    onOpenChange(false);
    toast.success("Resultado rejeitado.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-4 text-primary" />
            {range
              ? "Gerar mais comentários neste trecho"
              : job?.status === "ready"
                ? "Rever o chat gerado"
                : replaceAll
                  ? "Regenerar tudo com IA"
                  : "Gerar com IA"}
          </DialogTitle>
          <DialogDescription>
            {range
              ? `A IA analisa o que é dito entre ${clock(range.start)} e ${clock(range.end)} e escreve reações que encaixam no que já existe.`
              : "A IA ouve o vídeo, percebe cada momento e escreve uma conversa de chat sincronizada. Nada é publicado sem a sua revisão."}
          </DialogDescription>
        </DialogHeader>

        {drafts === null ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Modo</Label>
              <Select
                value={settings.mode}
                onValueChange={(v) => setSettings({ ...settings, mode: v as AiSettings["mode"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inteligente">
                    Inteligente — analisa o webinar antes de escrever
                  </SelectItem>
                  <SelectItem value="rapido">Rápido — gera direto, como antes</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {settings.mode === "inteligente"
                  ? "A IA lê o webinar inteiro, percebe o ritmo, antecipa onde se perde atenção, cria pessoas com memória e só escreve quando há razão para alguém comentar."
                  : "Geração direta a partir da transcrição, sem análise de estratégia."}
              </p>
            </div>
            {settings.mode === "inteligente" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Objetivo principal</Label>
                <Select
                  value={settings.objective}
                  onValueChange={(v) =>
                    setSettings({ ...settings, objective: v as AiSettings["objective"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retention">Retenção</SelectItem>
                    <SelectItem value="engagement">Engajamento</SelectItem>
                    <SelectItem value="conversion">Conversão</SelectItem>
                    <SelectItem value="balanced">Equilibrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Idioma</Label>
              <Select
                value={settings.variant}
                onValueChange={(v) =>
                  setSettings({ ...settings, variant: v as AiSettings["variant"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-PT">Português de Portugal</SelectItem>
                  <SelectItem value="pt-BR">Português do Brasil</SelectItem>
                  <SelectItem value="mixed">Misto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nível de engajamento</Label>
              <Select
                value={settings.level}
                onValueChange={(v) => setSettings({ ...settings, level: v as AiSettings["level"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixo</SelectItem>
                  <SelectItem value="medium">Médio</SelectItem>
                  <SelectItem value="high">Alto</SelectItem>
                  <SelectItem value="very-high">Muito alto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Quantidade de comentários</Label>
              <Select
                value={String(settings.targetTotal ?? 0)}
                onValueChange={(v) => {
                  const total = Number(v);
                  // Com a quantidade escolhida, sugerimos logo quantas pessoas
                  // fazem sentido: cada pessoa escreve umas poucas mensagens.
                  const suggested =
                    total > 0
                      ? Math.min(2000, Math.max(12, Math.round(total / 6)))
                      : settings.participants;
                  setSettings({ ...settings, targetTotal: total, participants: suggested });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Automático — ao ritmo do webinar</SelectItem>
                  <SelectItem value="150">100 a 200 comentários</SelectItem>
                  <SelectItem value="350">200 a 500 comentários</SelectItem>
                  <SelectItem value="750">500 a 1000 comentários</SelectItem>
                  <SelectItem value="1250">1000 a 1500 comentários</SelectItem>
                  <SelectItem value="2000">1500 a 2500 comentários</SelectItem>
                  <SelectItem value="4000">3000 a 5000 comentários</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                É um alvo aproximado: o número final depende do que acontece no vídeo. Quanto maior
                a quantidade, mais demora a gerar.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Frequência (segundos entre mensagens)</Label>
              <Input
                type="number"
                min={0}
                max={300}
                value={settings.frequency}
                onChange={(e) =>
                  setSettings({ ...settings, frequency: Math.max(0, Number(e.target.value) || 0) })
                }
                placeholder="0 = deixar ao nível escolhido"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Pessoas a interagir</Label>
              <Input
                type="number"
                min={3}
                max={2000}
                value={settings.participants}
                onChange={(e) =>
                  setSettings({ ...settings, participants: Number(e.target.value) || 25 })
                }
              />
              {settings.targetTotal > 0 && (
                <p className="text-xs text-muted-foreground">
                  Sugerido pela quantidade escolhida. Pode alterar à mão.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Emojis</Label>
              <Select
                value={settings.emojis}
                onValueChange={(v) =>
                  setSettings({ ...settings, emojis: v as AiSettings["emojis"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Poucos</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Muitos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tom</Label>
              <Select
                value={settings.tone}
                onValueChange={(v) => setSettings({ ...settings, tone: v as AiSettings["tone"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="natural">Natural</SelectItem>
                  <SelectItem value="excited">Entusiasmado</SelectItem>
                  <SelectItem value="professional">Profissional</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {settings.tone === "custom" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Como devem falar</Label>
                <Input
                  value={settings.customTone}
                  onChange={(e) => setSettings({ ...settings, customTone: e.target.value })}
                  placeholder="Ex.: pessoas do imobiliário, linguagem directa, algum ceticismo no início"
                />
              </div>
            )}
            <label className="flex items-center justify-between gap-4 rounded-xl border p-4 sm:col-span-2">
              <span>
                <strong className="block text-sm">Densidade por trecho</strong>
                <span className="text-xs text-muted-foreground">
                  Muita interação nas perguntas, provas sociais e oferta; partes técnicas mais
                  silenciosas.
                </span>
              </span>
              <Switch
                checked={settings.densityByMoment}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, densityByMoment: checked })
                }
              />
            </label>
            {replaceAll && (
              <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive sm:col-span-2">
                Ao inserir, os comentários gerados desta timeline são substituídos pelos novos. Os
                escritos à mão e os editados à mão ficam.
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {drafts.length} comentário{drafts.length === 1 ? "" : "s"} para rever, bloco a bloco
              da fala. Edite, apague ou regenere antes de inserir.
            </p>
            <AiCommentsReview
              drafts={drafts}
              blocks={inspection?.blocks ?? []}
              validation={job?.validation}
              busy={busy}
              durationSeconds={lastAt}
              onChange={(next) => setAiJobDrafts(webinarId, next)}
              onRegenerate={(index) => void regenerateOne(index)}
              onSeek={onSeek}
            />
          </div>
        )}

        {job && drafts === null && (
          <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
            <ol className="space-y-1.5">
              {AI_JOB_STAGES.map((label, index) => (
                <li
                  key={label}
                  className={
                    index <= job.stage
                      ? "flex items-center gap-2"
                      : "flex items-center gap-2 text-muted-foreground"
                  }
                >
                  {index < job.stage ? (
                    <Check className="size-4 text-primary" />
                  ) : index === job.stage && running ? (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  ) : (
                    <span className="size-4" />
                  )}
                  {label}
                </li>
              ))}
            </ol>
            {running && typeof job.progress === "number" && (
              <div className="space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${Math.max(2, Math.min(100, job.progress))}%` }}
                  />
                </div>
                <p className="text-xs font-medium text-muted-foreground">
                  {Math.min(100, job.progress)}%
                </p>
              </div>
            )}
            {running && (
              <p className="text-xs text-muted-foreground">
                Pode fechar esta janela — a geração continua em segundo plano e avisamos quando
                estiver pronta.
              </p>
            )}
          </div>
        )}

        {job?.note && (
          <p className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
            {job.note}
          </p>
        )}

        {lines.length > 0 && (
          <div className="rounded-xl border bg-muted/20">
            <button
              type="button"
              onClick={() => setShowTranscript((value) => !value)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"
            >
              <span className="flex items-center gap-2">
                <FileText className="size-4 text-primary" />
                Ver transcrição
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                {lines.length} momentos · até {clock(lastAt)}
                {running ? " · a transcrever…" : " · guardada, será reutilizada"}
              </span>
            </button>
            <div className="flex justify-end border-t px-4 py-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={async () => {
                  const text = lines.map((line) => `[${clock(line.at)}] ${line.text}`).join("\n");
                  try {
                    await navigator.clipboard.writeText(text);
                    toast.success("Transcrição copiada");
                  } catch {
                    toast.error("Não foi possível copiar a transcrição");
                  }
                }}
              >
                <Copy />
                Copiar transcrição
              </Button>
            </div>
            {showTranscript && inspection && inspection.words.length > 0 ? (
              <TranscriptWords
                inspection={inspection}
                mediaUrl={mediaUrl ?? null}
                {...(onSeek ? { onSeek } : {})}
              />
            ) : null}
            {showTranscript && !(inspection && inspection.words.length > 0) && (
              <div className="max-h-64 space-y-2 overflow-y-auto border-t px-4 py-3 text-xs leading-relaxed">
                {lines.map((line, index) => (
                  <p key={`${line.at}-${index}`} className="flex gap-3">
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {clock(line.at)}
                    </span>
                    <span className="text-foreground/90">{line.text}</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {running ? "Continuar em segundo plano" : "Fechar"}
          </Button>
          {drafts === null ? (
            <Button onClick={run} disabled={running}>
              {running ? <Loader2 className="animate-spin" /> : <Wand2 />}
              Gerar
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={reject}
                disabled={busy || running || saving}
              >
                <Trash2 />
                Rejeitar resultado
              </Button>
              <Button variant="outline" onClick={run} disabled={busy || running}>
                {running ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                Gerar outra vez
              </Button>
              <Button onClick={insert} disabled={saving || busy || running || drafts.length === 0}>
                {saving ? <Loader2 className="animate-spin" /> : <Check />}
                Inserir na timeline
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { clock as formatClock, toSeconds as parseClock };
