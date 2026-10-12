import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, Copy, ExternalLink, Pause, Pencil, Play, Square, Trophy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { AbStatusBadge, ComparisonTable, DailyChart, DistributionCard, RetentionChart, VariantDot, VerdictCard } from "@/components/ab-tests/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useAbTest, useAbTestActions } from "@/lib/ab-tests/hooks";
import { HISTORY_LABEL, statusOf, updateAbTestInput, type AbTestRow, type AbTestVariantRow } from "@/lib/ab-tests/model";
import { OBJECTIVES, objectiveInfo, type Objective } from "@/lib/ab-tests/stats";
import { formatDateTime, publicOrigin } from "@/lib/data";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/ab-tests/$testId")({
  head: () => ({ meta: [{ title: "Teste A/B | Novawebinar" }] }),
  component: AbTestPage,
});

function AbTestPage() {
  const { testId } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useAbTest(testId);
  const actions = useAbTestActions();

  if (isLoading)
    return (
      <AppShell title="A carregar teste" action={false}>
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  if (error || !data)
    return (
      <AppShell title="Teste não encontrado" action={false} back={{ to: "/ab-tests", label: "Testes A/B" }}>
        <p className="text-sm text-muted-foreground">{error ? friendlyError(error, "Este teste não existe ou não pertence ao seu workspace.") : "Este teste não existe ou não pertence ao seu workspace."}</p>
      </AppShell>
    );

  const { test, variants, metrics, evaluation, history, daily } = data;
  const status = statusOf(test.status);
  const objective = objectiveInfo(test.objective);
  const origin = publicOrigin();
  const link = `${origin}/w/${test.slug}`;
  const winner = test.applied_variant_id ? variants.find((v) => v.id === test.applied_variant_id) : null;
  const busy = actions.status.isPending || actions.winner.isPending || actions.duplicate.isPending || actions.update.isPending;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      toast.error(friendlyError(e, "Não foi possível concluir a acção."));
    }
  };
  const change = (action: "start" | "pause" | "resume" | "complete" | "archive", done: string) =>
    run(() => actions.status.mutateAsync({ testId: test.id, action }), done);
  const copyLink = () => {
    (navigator.clipboard?.writeText(link) ?? Promise.reject(new Error("sem clipboard"))).then(
      () => toast.success("Endereço do teste copiado."),
      () => toast.error("Não foi possível copiar."),
    );
  };

  return (
    <AppShell
      back={{ to: "/ab-tests", label: "Testes A/B" }}
      title={test.name}
      description={`${objective.label} · ${link}`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <AbStatusBadge status={test.status} />
          <Button variant="outline" size="sm" onClick={copyLink}>
            <Copy className="size-4" /> Copiar endereço
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={link} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" /> Abrir
            </a>
          </Button>
          {status === "draft" ? (
            <Button size="sm" disabled={busy} onClick={() => void change("start", "Teste a correr.")}>
              <Play className="size-4" /> Iniciar
            </Button>
          ) : null}
          {status === "active" ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void change("pause", "Teste em pausa.")}>
              <Pause className="size-4" /> Pausar
            </Button>
          ) : null}
          {status === "paused" ? (
            <Button size="sm" disabled={busy} onClick={() => void change("resume", "Teste retomado.")}>
              <Play className="size-4" /> Retomar
            </Button>
          ) : null}
          {status === "active" || status === "paused" ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void change("complete", "Teste concluído.")}>
              <Square className="size-4" /> Concluir
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { id } = await actions.duplicate.mutateAsync({ testId: test.id });
                void navigate({ to: "/ab-tests/$testId", params: { testId: id } });
              }, "Cópia criada em rascunho.")
            }
          >
            <Copy className="size-4" /> Duplicar
          </Button>
          {status !== "active" && status !== "archived" ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await actions.status.mutateAsync({ testId: test.id, action: "archive" });
                  void navigate({ to: "/ab-tests" });
                }, "Teste arquivado.")
              }
            >
              <Archive className="size-4" /> Arquivar
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <VerdictCard evaluation={evaluation} threshold={Number(test.confidence_threshold ?? 95)} />

          <DistributionCard variants={metrics.variants} slug={test.slug} origin={origin} />

          <section className="rounded-card bg-card p-5 sm:p-6">
            <h2 className="font-semibold">A contra B</h2>
            <p className="mt-1 text-sm text-muted-foreground">O que cada variante fez, de quem abriu o endereço até quem comprou. As taxas são sobre a linha anterior do funil.</p>
            <div className="mt-4">
              <ComparisonTable variants={metrics.variants} />
            </div>
          </section>

          <section className="rounded-card bg-card p-5 sm:p-6">
            <h2 className="font-semibold">Visitantes por dia</h2>
            <p className="mt-1 text-sm text-muted-foreground">Quem abriu o endereço pela primeira vez, por variante, nos últimos 14 dias.</p>
            <div className="mt-4">
              <DailyChart days={daily} variants={metrics.variants} />
            </div>
          </section>

          <section className="rounded-card bg-card p-5 sm:p-6">
            <h2 className="font-semibold">Retenção no vídeo</h2>
            <p className="mt-1 text-sm text-muted-foreground">De quem começou a ver, quantos ainda estavam em cada ponto do vídeo, variante a variante.</p>
            <div className="mt-4">
              <RetentionChart variants={metrics.variants} />
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <VariantsCard test={test} variants={variants} winner={winner ?? null} busy={busy} onWinner={(v) => void run(() => actions.winner.mutateAsync({ testId: test.id, variantId: v.id }), `Variante ${v.label} aplicada.`)} onTraffic={(traffic) => run(() => actions.update.mutateAsync({ testId: test.id, traffic }), "Divisão do tráfego guardada.")} />

          <SettingsCard test={test} busy={busy} onSave={(patch) => run(() => actions.update.mutateAsync({ testId: test.id, ...patch }), "Definições guardadas.")} />

          <section className="rounded-card bg-card p-5 sm:p-6">
            <h2 className="font-semibold">Histórico</h2>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Ainda sem acontecimentos.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex items-baseline justify-between gap-3">
                    <span>{HISTORY_LABEL[h.action] ?? h.action}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">{formatDateTime(h.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}

/** As variantes com o webinar, a fatia do tráfego (editável) e a acção de aplicar como vencedora. */
function VariantsCard({
  test,
  variants,
  winner,
  busy,
  onWinner,
  onTraffic,
}: {
  test: AbTestRow;
  variants: AbTestVariantRow[];
  winner: AbTestVariantRow | null;
  busy: boolean;
  onWinner: (variant: AbTestVariantRow) => void;
  onTraffic: (traffic: { variantId: string; trafficPercentage: number }[]) => Promise<void>;
}) {
  const status = statusOf(test.status);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const current = (v: AbTestVariantRow) => draft[v.id] ?? String(v.traffic_percentage);
  const total = variants.reduce((sum, v) => sum + (Number(current(v)) || 0), 0);
  const canEditTraffic = !winner && status !== "archived" && status !== "completed";

  return (
    <section className="rounded-card bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Variantes</h2>
        {canEditTraffic && !editing ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Dividir tráfego
          </Button>
        ) : null}
      </div>
      <ul className="mt-3 space-y-3">
        {variants.map((v) => (
          <li key={v.id} className="rounded-md bg-background p-3 ring-1 ring-[var(--border-subtle)]">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <VariantDot position={v.position} /> {v.label}
                {v.name ? <span className="text-muted-foreground">· {v.name}</span> : null}
              </span>
              {editing ? (
                <span className="relative inline-flex w-24">
                  <Input value={current(v)} inputMode="numeric" aria-label={`Tráfego da variante ${v.label}`} onChange={(e) => setDraft((d) => ({ ...d, [v.id]: e.target.value.replace(/\D/g, "").slice(0, 3) }))} className="h-8 pr-7 text-right" />
                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">%</span>
                </span>
              ) : (
                <span className="text-sm tabular-nums text-muted-foreground">{v.traffic_percentage}% do tráfego</span>
              )}
            </div>
            {v.webinar ? (
              <Link to="/webinars/$webinarId/edit" params={{ webinarId: v.webinar.id }} className="mt-1 block truncate text-sm text-primary hover:underline">
                {v.webinar.public_title || v.webinar.internal_name}
              </Link>
            ) : (
              <p className="mt-1 text-sm text-destructive">Sem webinar: esta variante não abre.</p>
            )}
            {winner?.id === v.id ? <p className="mt-1 text-sm font-medium text-[#1D8A5E]">Vencedora aplicada: o endereço entrega sempre esta.</p> : null}
            {!winner && status !== "archived" && !editing ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={busy || !v.webinar}
                onClick={() => {
                  if (!window.confirm(`Aplicar a variante ${v.label} como vencedora? O endereço passa a entregar sempre esse webinar e o teste fica concluído.`)) return;
                  onWinner(v);
                }}
              >
                <Trophy className="size-4" /> Aplicar como vencedora
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {editing ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className={total === 100 ? "text-sm text-muted-foreground" : "text-sm font-medium text-destructive"}>Tráfego: {total}% de 100%</p>
          <span className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => { setEditing(false); setDraft({}); }}>
              Cancelar
            </Button>
            <Button size="sm" disabled={busy || total !== 100} onClick={() => void onTraffic(variants.map((v) => ({ variantId: v.id, trafficPercentage: Number(current(v)) || 0 }))).then(() => { setEditing(false); setDraft({}); })}>
              Guardar divisão
            </Button>
          </span>
        </div>
      ) : null}
      {editing ? <p className="mt-2 text-[13px] text-muted-foreground">Quem já tem variante mantém-na; a nova divisão vale para quem chega de novo.</p> : null}
    </section>
  );
}

/** As regras do teste, com edição no próprio cartão, e o interruptor de aplicar a vencedora sozinho. */
function SettingsCard({ test, busy, onSave }: { test: AbTestRow; busy: boolean; onSave: (patch: Record<string, unknown>) => Promise<void> }) {
  const status = statusOf(test.status);
  const objective = objectiveInfo(test.objective);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(test.name);
  const [obj, setObj] = useState<Objective>(test.objective as Objective);
  const [visitors, setVisitors] = useState(String(test.minimum_visitors ?? 500));
  const [conversions, setConversions] = useState(String(test.minimum_conversions ?? 30));
  const [days, setDays] = useState(String(test.minimum_duration_days ?? 3));
  const [confidence, setConfidence] = useState(String(test.confidence_threshold ?? 95));
  const [mode, setMode] = useState<"deterministic" | "legacy">(test.assignment_mode === "legacy" ? "legacy" : "deterministic");

  const save = async () => {
    const parsed = updateAbTestInput.safeParse({
      name,
      objective: obj,
      minimumVisitors: Number(visitors),
      minimumConversions: Number(conversions),
      minimumDurationDays: Number(days),
      confidenceThreshold: Number(confidence),
      assignmentMode: mode,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Reveja os campos.");
      return;
    }
    await onSave(parsed.data);
    setEditing(false);
  };

  return (
    <section className="rounded-card bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Critérios</h2>
        {status !== "archived" && !editing ? (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" /> Editar
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ab-edit-name">Nome</Label>
            <Input id="ab-edit-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Objectivo</Label>
            <Select value={obj} onValueChange={(value) => setObj(value as Objective)}>
              <SelectTrigger aria-label="Objectivo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OBJECTIVES.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField id="ab-edit-visitors" label="Mín. visitantes" value={visitors} onChange={setVisitors} />
            <NumberField id="ab-edit-conversions" label="Mín. compras" value={conversions} onChange={setConversions} />
            <NumberField id="ab-edit-days" label="Dias mínimos" value={days} onChange={setDays} />
            <NumberField id="ab-edit-confidence" label="Confiança (%)" value={confidence} onChange={setConfidence} />
          </div>
          <div className="space-y-1.5">
            <Label>Atribuição</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as "deterministic" | "legacy")}>
              <SelectTrigger aria-label="Modo de atribuição">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deterministic">Fixa por pessoa (recomendado)</SelectItem>
                <SelectItem value="legacy">Ao acaso em cada primeira visita</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void save()}>
              Guardar
            </Button>
          </div>
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Objectivo</dt>
          <dd>{objective.label}</dd>
          <dt className="text-muted-foreground">Confiança para decidir</dt>
          <dd>{Number(test.confidence_threshold ?? 95)}%</dd>
          <dt className="text-muted-foreground">Mínimo de visitantes</dt>
          <dd>{test.minimum_visitors ?? 500} por variante</dd>
          <dt className="text-muted-foreground">Mínimo de compras</dt>
          <dd>{test.minimum_conversions ?? 30} por variante</dd>
          <dt className="text-muted-foreground">Duração mínima</dt>
          <dd>{test.minimum_duration_days ?? 3} dias</dd>
          <dt className="text-muted-foreground">Atribuição</dt>
          <dd>{test.assignment_mode === "legacy" ? "Ao acaso na primeira visita" : "Fixa por pessoa"}</dd>
          <dt className="text-muted-foreground">Início</dt>
          <dd>{test.started_at ? formatDateTime(test.started_at) : "Ainda não começou"}</dd>
          {test.ended_at ? (
            <>
              <dt className="text-muted-foreground">Fim</dt>
              <dd>{formatDateTime(test.ended_at)}</dd>
            </>
          ) : null}
        </dl>
      )}
      {status !== "archived" && status !== "completed" ? (
        <div className="mt-4 flex items-start justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
          <div>
            <p className="text-sm font-medium">Aplicar a vencedora sozinho</p>
            <p className="text-[13px] text-muted-foreground">Quando o resultado ficar consistente, a melhor variante passa a receber todo o tráfego e o teste conclui.</p>
          </div>
          <Switch checked={Boolean(test.auto_winner)} disabled={busy} onCheckedChange={(on) => void onSave({ autoWinner: on })} aria-label="Aplicar a vencedora sozinho" />
        </div>
      ) : null}
    </section>
  );
}

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} inputMode="numeric" onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, "").slice(0, 7))} />
    </div>
  );
}
