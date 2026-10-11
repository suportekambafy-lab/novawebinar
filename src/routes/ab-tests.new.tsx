import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { VariantDot } from "@/components/ab-tests/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAbTestActions } from "@/lib/ab-tests/hooks";
import { abSlug, createAbTestInput, variantLabel } from "@/lib/ab-tests/model";
import { OBJECTIVES, type Objective } from "@/lib/ab-tests/stats";
import { publicOrigin, useWebinars, useWorkspace } from "@/lib/data";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/ab-tests/new")({
  head: () => ({ meta: [{ title: "Novo teste A/B | Novawebinar" }] }),
  component: NewAbTestPage,
});

const NONE = "none";

type VariantDraft = { webinarId: string; name: string; traffic: string };

/** Fatias iguais que somam 100: a primeira fica com o resto. */
function evenSplit(n: number): string[] {
  const base = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => String(i === 0 ? 100 - base * (n - 1) : base));
}

function NewAbTestPage() {
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const orgId = workspace?.organizationId;
  const { data: webinars = [] } = useWebinars(orgId);
  const { create } = useAbTestActions();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [objective, setObjective] = useState<Objective>("conversions");
  const [productName, setProductName] = useState("");
  const [variants, setVariants] = useState<VariantDraft[]>([
    { webinarId: NONE, name: "", traffic: "50" },
    { webinarId: NONE, name: "", traffic: "50" },
  ]);
  const [minimumVisitors, setMinimumVisitors] = useState("500");
  const [minimumConversions, setMinimumConversions] = useState("30");
  const [minimumDurationDays, setMinimumDurationDays] = useState("3");
  const [confidenceThreshold, setConfidenceThreshold] = useState("95");
  const [assignmentMode, setAssignmentMode] = useState<"deterministic" | "legacy">("deterministic");

  const total = variants.reduce((sum, v) => sum + (Number(v.traffic) || 0), 0);
  const published = webinars.filter((w) => w.status !== "draft");
  const link = `${publicOrigin()}/w/${slug || "endereco"}`;

  const setVariant = (i: number, patch: Partial<VariantDraft>) =>
    setVariants((prev) => prev.map((v, index) => (index === i ? { ...v, ...patch } : v)));
  const addVariant = () =>
    setVariants((prev) => {
      const next = [...prev, { webinarId: NONE, name: "", traffic: "0" }];
      const split = evenSplit(next.length);
      return next.map((v, i) => ({ ...v, traffic: split[i]! }));
    });
  const removeVariant = (i: number) =>
    setVariants((prev) => {
      const next = prev.filter((_, index) => index !== i);
      const split = evenSplit(next.length);
      return next.map((v, idx) => ({ ...v, traffic: split[idx]! }));
    });

  const submit = async (start: boolean) => {
    if (!orgId) return;
    const parsed = createAbTestInput.safeParse({
      name,
      slug,
      objective,
      productName,
      minimumVisitors: Number(minimumVisitors),
      minimumConversions: Number(minimumConversions),
      minimumDurationDays: Number(minimumDurationDays),
      confidenceThreshold: Number(confidenceThreshold),
      assignmentMode,
      variants: variants.map((v) => ({ webinarId: v.webinarId === NONE ? "" : v.webinarId, name: v.name, trafficPercentage: Number(v.traffic) })),
      start,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue?.path[0];
      toast.error(path === "variants" && issue?.code !== "custom" ? "Escolha um webinar diferente para cada variante." : (issue?.message ?? "Reveja os campos."));
      return;
    }
    try {
      const { id } = await create.mutateAsync({ ...parsed.data, organizationId: orgId });
      toast.success(start ? "Teste criado e a correr." : "Teste guardado em rascunho.");
      void navigate({ to: "/ab-tests/$testId", params: { testId: id } });
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível criar o teste."));
    }
  };

  return (
    <AppShell back={{ to: "/ab-tests", label: "Testes A/B" }} title="Novo teste A/B" description="Um endereço, dois ou mais webinars. Quem o abre vê sempre a mesma variante." action={false} compact>
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <Section n={1} title="Nome e endereço" hint="O endereço é o que partilha nos anúncios; nunca muda, seja qual for a variante que a pessoa vê.">
          <div className="space-y-1.5">
            <Label htmlFor="ab-name">Nome do teste</Label>
            <Input
              id="ab-name"
              value={name}
              maxLength={120}
              placeholder="Ex.: Abertura curta vs. longa"
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(abSlug(e.target.value));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab-slug">Endereço do teste</Label>
            <Input
              id="ab-slug"
              value={slug}
              maxLength={48}
              placeholder="abertura-curta-vs-longa"
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(abSlug(e.target.value.replace(/\s+/g, "-")));
              }}
            />
            <p className="text-sm text-muted-foreground">{link}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ab-product">Produto (opcional)</Label>
            <Input id="ab-product" value={productName} maxLength={120} placeholder="O produto que o webinar vende" onChange={(e) => setProductName(e.target.value)} />
          </div>
        </Section>

        <Section n={2} title="Variantes" hint="Cada variante é um webinar já publicado. A divisão do tráfego tem de somar 100%.">
          <div className="space-y-3">
            {variants.map((v, i) => (
              <div key={i} className="grid gap-2 rounded-md bg-white p-3 ring-1 ring-[var(--border-subtle)] sm:grid-cols-[auto_minmax(0,1fr)_120px_80px_auto] sm:items-center">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                  <VariantDot position={i} /> {variantLabel(i)}
                </span>
                <Select value={v.webinarId} onValueChange={(webinarId) => setVariant(i, { webinarId })}>
                  <SelectTrigger aria-label={`Webinar da variante ${variantLabel(i)}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Escolher webinar</SelectItem>
                    {published.map((w) => (
                      <SelectItem key={w.id} value={w.id} disabled={variants.some((other, idx) => idx !== i && other.webinarId === w.id)}>
                        {w.public_title || w.internal_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input value={v.name} maxLength={80} placeholder="Apelido (opcional)" aria-label={`Nome da variante ${variantLabel(i)}`} onChange={(e) => setVariant(i, { name: e.target.value })} />
                <div className="relative">
                  <Input value={v.traffic} inputMode="numeric" aria-label={`Tráfego da variante ${variantLabel(i)}`} onChange={(e) => setVariant(i, { traffic: e.target.value.replace(/\D/g, "").slice(0, 3) })} className="pr-7" />
                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">%</span>
                </div>
                <Button variant="ghost" size="icon" aria-label={`Tirar a variante ${variantLabel(i)}`} disabled={variants.length <= 2} onClick={() => removeVariant(i)}>
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={total === 100 ? "text-sm text-muted-foreground" : "text-sm font-medium text-destructive"}>Tráfego: {total}% de 100%</p>
            <Button variant="outline" size="sm" disabled={variants.length >= 6} onClick={addVariant}>
              <Plus /> Adicionar variante
            </Button>
          </div>
          {published.length < 2 ? <p className="text-sm text-warning">Precisa de pelo menos dois webinars publicados para montar um teste.</p> : null}
        </Section>

        <Section n={3} title="Objectivo e critérios" hint="O teste só conclui quando cada variante tiver visitantes, compras e dias suficientes, e a confiança chegar ao limiar.">
          <div className="space-y-1.5">
            <Label>Objectivo</Label>
            <Select value={objective} onValueChange={(value) => setObjective(value as Objective)}>
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
            <p className="text-sm text-muted-foreground">{OBJECTIVES.find((o) => o.id === objective)?.hint}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Mínimo de visitantes por variante" id="ab-min-visitors" value={minimumVisitors} onChange={setMinimumVisitors} />
            <Field label="Mínimo de compras por variante" id="ab-min-conversions" value={minimumConversions} onChange={setMinimumConversions} />
            <Field label="Duração mínima (dias)" id="ab-min-days" value={minimumDurationDays} onChange={setMinimumDurationDays} />
            <Field label="Confiança para decidir (%)" id="ab-confidence" value={confidenceThreshold} onChange={setConfidenceThreshold} />
          </div>
          <div className="space-y-1.5">
            <Label>Como se escolhe a variante</Label>
            <Select value={assignmentMode} onValueChange={(value) => setAssignmentMode(value as "deterministic" | "legacy")}>
              <SelectTrigger aria-label="Modo de atribuição">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deterministic">Fixa por pessoa (recomendado)</SelectItem>
                <SelectItem value="legacy">Ao acaso em cada primeira visita</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Nos dois modos a pessoa vê sempre a mesma variante depois da primeira visita.</p>
          </div>
        </Section>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={create.isPending} onClick={() => void submit(false)}>
            Guardar rascunho
          </Button>
          <Button variant="dark" disabled={create.isPending} onClick={() => void submit(true)}>
            Criar e iniciar
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, id, value, onChange }: { label: string; id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} inputMode="numeric" onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, "").slice(0, 7))} />
    </div>
  );
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-card bg-card p-5 sm:p-6">
      <header>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className="grid size-6 place-items-center rounded-full bg-chip text-xs text-muted-foreground">{n}</span>
          {title}
        </h2>
        {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
      </header>
      {children}
    </section>
  );
}
