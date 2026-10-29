import { createFileRoute } from "@tanstack/react-router";
import { BrainCircuit, Check, Copy, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { EmptySection, Metric } from "@/components/page-primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { publicOrigin, useWebinars, useWorkspace } from "@/lib/data";
import { friendlyError } from "@/lib/friendly-error";
import { useSmartLinkActions, useSmartLinks } from "@/lib/intelligence/hooks";
import { smartLinkInput, smartSlug, type SmartLinkSummary } from "@/lib/intelligence/model";

export const Route = createFileRoute("/intelligence")({
  head: () => ({
    meta: [
      { title: "Webinar Intelligence | Novawebinar" },
      { name: "description", content: "Um endereço que decide o webinar pela pessoa: favorito para quem chega de novo, secundário para quem já viu." },
    ],
  }),
  component: IntelligencePage,
});

const NONE = "none";

function IntelligencePage() {
  const { data: workspace } = useWorkspace();
  const orgId = workspace?.organizationId;
  const { data: links = [], isLoading } = useSmartLinks(orgId);
  const { data: webinars = [] } = useWebinars(orgId);
  const published = webinars.filter((w) => w.status !== "draft");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const active = links.filter((l) => l.link.status === "active").length;
  const week = links.reduce((sum, l) => sum + l.visits.week, 0);
  const weekReturning = links.reduce((sum, l) => sum + l.visits.weekReturning, 0);

  return (
    <AppShell
      title="Webinar Intelligence"
      description="Um endereço só. Quem chega pela primeira vez vê o seu webinar favorito; quem já viu um webinar seu vê o secundário."
      action={
        (isLoading || links.length > 0) && (
          <Button onClick={() => setCreating(true)} disabled={creating}>
            <Plus /> Novo endereço
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Endereços activos" value={isLoading ? "…" : String(active)} icon={BrainCircuit} />
          <Metric label="Visitas nos últimos 7 dias" value={isLoading ? "…" : week.toLocaleString("pt-PT")} change="Quem abriu um endereço inteligente" />
          <Metric label="Já tinham visto" value={isLoading ? "…" : weekReturning.toLocaleString("pt-PT")} change="Foram para o secundário" />
        </div>

        {creating && orgId ? (
          <LinkForm
            organizationId={orgId}
            webinars={published}
            onClose={() => setCreating(false)}
          />
        ) : null}

        <div className="overflow-hidden rounded-card bg-card">
          <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
            <h2 className="text-base font-semibold tracking-[var(--tracking-title)]">Os seus endereços</h2>
            {!isLoading && (
              <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
                {links.length} {links.length === 1 ? "endereço" : "endereços"}
              </p>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-3 px-6 pb-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </div>
          ) : links.length === 0 && !creating ? (
            <EmptySection
              icon={BrainCircuit}
              title="Ainda sem endereços inteligentes"
              description="Escolha o webinar favorito e o secundário, dê um endereço, e partilhe-o. Quem já viu um webinar seu vai para o secundário sem o endereço mudar."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Novo endereço
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {links.map((item) =>
                editing === item.link.id && orgId ? (
                  <li key={item.link.id} className="p-4 sm:p-5">
                    <LinkForm organizationId={orgId} webinars={published} existing={item} onClose={() => setEditing(null)} />
                  </li>
                ) : (
                  <LinkRow key={item.link.id} item={item} onEdit={() => setEditing(item.link.id)} />
                ),
              )}
            </ul>
          )}
        </div>

        <section className="rounded-card bg-card p-5 text-sm text-muted-foreground sm:p-6">
          <h3 className="mb-2 text-base font-semibold text-foreground">Como se sabe que a pessoa já viu um webinar seu</h3>
          <ul className="list-disc space-y-1 pl-5">
            <li>Entrou numa sala sua neste aparelho (fica marcado no navegador durante um ano).</li>
            <li>O link traz o e-mail ou o WhatsApp dela (links dos e-mails e das mensagens) e esse contacto já participou num webinar seu.</li>
          </ul>
          <p className="mt-2">Sem nenhum destes sinais, é tratada como nova e vai para o favorito. Durante a mesma ida (6 horas) a pessoa fica no webinar que o endereço lhe deu, mesmo depois de se inscrever. Com o endereço em pausa, toda a gente vai para o favorito.</p>
        </section>
      </div>
    </AppShell>
  );
}

function LinkRow({ item, onEdit }: { item: SmartLinkSummary; onEdit: () => void }) {
  const { update, remove } = useSmartLinkActions();
  const url = `${publicOrigin()}/w/${item.link.slug}`;
  const [copied, setCopied] = useState(false);
  const paused = item.link.status !== "active";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar. Seleccione o endereço e copie à mão.");
    }
  };
  const toggle = async (on: boolean) => {
    try {
      await update.mutateAsync({ linkId: item.link.id, patch: { status: on ? "active" : "paused" } });
      toast.success(on ? "Endereço activo." : "Endereço em pausa: toda a gente vai para o favorito.");
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível mudar o estado."));
    }
  };
  const destroy = async () => {
    if (!window.confirm(`Apagar o endereço «${item.link.name}»? Quem o abrir deixa de encontrar a sala. Não há como desfazer.`)) return;
    try {
      await remove.mutateAsync(item.link.id);
      toast.success("Endereço apagado.");
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível apagar."));
    }
  };
  const title = (w: SmartLinkSummary["primary"]) => (w ? w.public_title || w.internal_name : "—");
  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{item.link.name}</h3>
          <Badge variant={paused ? "secondary" : "default"}>{paused ? "Em pausa" : "Activo"}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <code className="rounded bg-chip px-1.5 py-0.5 text-[13px]">{url}</code>
          <Button variant="ghost" size="sm" onClick={() => void copy()} aria-label="Copiar o endereço">
            {copied ? <Check /> : <Copy />} {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Novos → <span className="text-foreground">{title(item.primary)}</span>
          {" · "}
          Já viram → <span className="text-foreground">{item.secondary ? title(item.secondary) : "o favorito (sem secundário)"}</span>
        </p>
        <p className="text-[13px] text-muted-foreground tabular-nums">
          {item.visits.total} {item.visits.total === 1 ? "visita" : "visitas"} desde sempre, {item.visits.returning} de quem já tinha visto · últimos 7 dias: {item.visits.week}, {item.visits.weekReturning} já tinham visto
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={!paused} onCheckedChange={(on) => void toggle(on)} aria-label="Endereço activo" />
        </label>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil /> Editar
        </Button>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label="Apagar o endereço" onClick={() => void destroy()}>
          <Trash2 />
        </Button>
      </div>
    </li>
  );
}

function LinkForm({
  organizationId,
  webinars,
  existing,
  onClose,
}: {
  organizationId: string;
  webinars: { id: string; public_title: string | null; internal_name: string }[];
  existing?: SmartLinkSummary;
  onClose: () => void;
}) {
  const { create, update } = useSmartLinkActions();
  const [name, setName] = useState(existing?.link.name ?? "");
  const [slug, setSlug] = useState(existing?.link.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(existing));
  const [primary, setPrimary] = useState(existing?.link.primary_webinar_id ?? NONE);
  const [secondary, setSecondary] = useState(existing?.link.secondary_webinar_id ?? NONE);
  const link = `${publicOrigin()}/w/${slug || "endereco"}`;
  const busy = create.isPending || update.isPending;

  const submit = async () => {
    const parsed = smartLinkInput.safeParse({
      name,
      slug,
      primaryWebinarId: primary === NONE ? "" : primary,
      secondaryWebinarId: secondary === NONE ? null : secondary,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Reveja os campos.");
      return;
    }
    try {
      if (existing) await update.mutateAsync({ linkId: existing.link.id, patch: parsed.data });
      else await create.mutateAsync({ ...parsed.data, organizationId });
      toast.success(existing ? "Endereço guardado." : "Endereço criado e activo.");
      onClose();
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível guardar o endereço."));
    }
  };

  const options = (exclude: string) =>
    webinars
      .filter((w) => w.id !== exclude)
      .map((w) => (
        <SelectItem key={w.id} value={w.id}>
          {w.public_title || w.internal_name}
        </SelectItem>
      ));

  return (
    <section className="space-y-4 rounded-card bg-card p-5 ring-1 ring-[var(--border-subtle)] sm:p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{existing ? "Editar endereço" : "Novo endereço inteligente"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">O endereço nunca muda; o webinar que abre é que depende de quem o abre.</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={onClose}>
          <X />
        </Button>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldBlock label="Nome" htmlFor="smart-name">
          <Input
            id="smart-name"
            value={name}
            maxLength={120}
            placeholder="Ex.: Link principal dos anúncios"
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(smartSlug(e.target.value));
            }}
          />
        </FieldBlock>
        <FieldBlock label="Endereço" htmlFor="smart-slug" hint={link}>
          <Input
            id="smart-slug"
            value={slug}
            maxLength={48}
            placeholder="aula-gratis"
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(smartSlug(e.target.value.replace(/\s+/g, "-")));
            }}
          />
        </FieldBlock>
        <FieldBlock label="Webinar favorito" hint="Para quem chega pela primeira vez.">
          <Select value={primary} onValueChange={setPrimary}>
            <SelectTrigger aria-label="Webinar favorito">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Escolher webinar</SelectItem>
              {options(secondary)}
            </SelectContent>
          </Select>
        </FieldBlock>
        <FieldBlock label="Webinar secundário" hint="Para quem já viu um webinar seu. Sem ele, vai todo para o favorito.">
          <Select value={secondary} onValueChange={setSecondary}>
            <SelectTrigger aria-label="Webinar secundário">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem secundário</SelectItem>
              {options(primary)}
            </SelectContent>
          </Select>
        </FieldBlock>
      </div>
      {webinars.length < 2 ? <p className="text-sm text-warning">Precisa de pelo menos dois webinars publicados para separar novos de quem já viu.</p> : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="dark" disabled={busy} onClick={() => void submit()}>
          {existing ? "Guardar" : "Criar endereço"}
        </Button>
      </div>
    </section>
  );
}

function FieldBlock({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
