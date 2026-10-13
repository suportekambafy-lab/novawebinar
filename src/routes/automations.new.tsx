import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { useWebhookDestination } from "@/components/automation-flow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createBaseWorkflow, formatDateTime, useInvalidate, useWebinars, useWorkflows, useWorkspace } from "@/lib/data";
import { friendlyError } from "@/lib/friendly-error";
import { cn } from "@/lib/utils";
import { CHANNELS, channelStatus } from "@/lib/workflow";

export const Route = createFileRoute("/automations/new")({
  head: () => ({ meta: [{ title: "Novo fluxo | Novawebinar" }] }),
  component: NewFlowPage,
});

const NONE = "none";

/** Passo 1 de um fluxo: configurar. O desenho vem a seguir, no editor. */
function NewFlowPage() {
  const navigate = useNavigate();
  const { data: workspace } = useWorkspace();
  const orgId = workspace?.organizationId;
  const { data: webinars = [] } = useWebinars(orgId);
  const { data: workflows = [] } = useWorkflows(orgId);
  const invalidate = useInvalidate();
  const [chosen, setWebinarId] = useState<string>();
  const [name, setName] = useState("");
  const [groupUrl, setGroupUrl] = useState("");
  const [busy, setBusy] = useState(false);

  // Um fluxo por webinar: os que já têm fluxo não aparecem. Sem escolha, fica o mais recente ainda livre.
  const free = webinars.filter((w) => !workflows.some((f) => f.webinar_id === w.id));
  const webinarId = chosen ?? free[0]?.id ?? NONE;
  const webinar = webinars.find((w) => w.id === webinarId);
  const destination = useWebhookDestination(orgId, webinar?.id ?? null);
  const title = webinar ? webinar.public_title || webinar.internal_name : "";
  const status = channelStatus(Boolean(workspace?.isTest), destination.ready, destination.whatsappReady);

  const create = async () => {
    if (!orgId) return;
    setBusy(true);
    try {
      const id = await createBaseWorkflow(orgId, webinar ? { id: webinar.id, title } : null, {
        name: name.trim() || undefined,
        groupUrl: groupUrl.trim() || undefined,
      });
      invalidate(["workflows", "automations"]);
      void navigate({ to: "/automations/workflows/$workflowId", params: { workflowId: id } });
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível criar o fluxo."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      back={{ to: "/automations", label: "Automações" }}
      title="Novo fluxo"
      description="Primeiro configura-se; depois desenha-se. O fluxo começa vazio."
      action={false}
      compact
    >
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <Section n={1} title="Webinar" hint="É o centro do fluxo: as horas das mensagens contam a partir das sessões dele.">
          <Select value={webinarId} onValueChange={setWebinarId}>
            <SelectTrigger aria-label="Webinar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Ainda não criei o webinar</SelectItem>
              {free.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.public_title || w.internal_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {webinarId === NONE ? (
            <p className="text-sm text-muted-foreground">
              Pode desenhar e escrever tudo já. O fluxo fica em rascunho e só liga depois de escolher o webinar.
            </p>
          ) : (
            webinar && (
              <div className="flex gap-4 rounded-md bg-white p-3 ring-1 ring-[var(--border-subtle)]">
                {(webinar.registration_cover_url || webinar.cover_url) && (
                  <img src={webinar.registration_cover_url || webinar.cover_url || ""} alt="" className="h-20 w-32 shrink-0 rounded-md object-cover" />
                )}
                <div className="min-w-0 flex-1 space-y-0.5 text-sm">
                  <p className="truncate font-medium">{title}</p>
                  <p className="text-muted-foreground">
                    {[
                      webinar.scheduled_at ? formatDateTime(webinar.scheduled_at) : webinar.recurrence_enabled ? "Sessões recorrentes" : "Sem hora marcada",
                      webinar.duration_seconds ? `${Math.round(webinar.duration_seconds / 60)} min` : null,
                      webinar.pitch_seconds ? `pitch ao minuto ${Math.round(webinar.pitch_seconds / 60)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <p className="text-muted-foreground">
                    {webinar.cta_url ? `Oferta: ${webinar.cta_price_now ? `${webinar.cta_price_now} · ` : ""}${webinar.cta_url}` : "Oferta por definir no webinar"}
                  </p>
                  <Link to="/webinars/$webinarId/edit" params={{ webinarId: webinar.id }} className="inline-block font-medium text-primary hover:underline">
                    Ver o webinar
                  </Link>
                </div>
              </div>
            )
          )}
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="flow-name">Nome do fluxo</Label>
            <Input
              id="flow-name"
              value={name}
              maxLength={120}
              placeholder={webinar ? `Fluxo · ${title}` : "Lançamento de novembro"}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </Section>

        <Section n={2} title="Oferta e grupo" hint="O que as mensagens precisam de saber para sair completas.">
          <div className="space-y-1">
            <p className="text-sm font-medium">Oferta</p>
            <p className="text-sm text-muted-foreground">
              {!webinar
                ? "Vem do webinar que escolher."
                : webinar.cta_url
                  ? `${webinar.cta_price_now ? `${webinar.cta_price_now} · ` : ""}${webinar.cta_url}`
                  : "Por definir no webinar, no passo Oferta. Sem o link, as mensagens que o usam não saem."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="group-url">Grupo de WhatsApp (opcional)</Label>
            <Input
              id="group-url"
              value={groupUrl}
              placeholder="https://chat.whatsapp.com/…"
              onChange={(e) => setGroupUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Entra no fluxo como o grupo do lançamento e nas mensagens como {"{{link_grupo}}"}. O grupo não separa quem já
              comprou: serve para lembretes e replay.
            </p>
          </div>
        </Section>

        <Section n={3} title="Canais" hint="Por onde as mensagens saem. Ligam-se em Integrações; até lá, ficam preparadas.">
          <ul className="divide-y divide-[var(--border-subtle)] rounded-md bg-white ring-1 ring-[var(--border-subtle)]">
            {status.map((s) => (
              <li key={s.channel} className="flex items-center gap-3 px-3 py-2 text-sm">
                {s.ready ? (
                  <Check className="size-4 shrink-0 text-success" aria-hidden />
                ) : (
                  <TriangleAlert className="size-4 shrink-0 text-warning" aria-hidden />
                )}
                <span className="flex-1">{CHANNELS[s.channel].label}</span>
                <span className="text-xs text-muted-foreground">{s.note}</span>
              </li>
            ))}
          </ul>
          <Link to="/integrations" className="text-sm font-medium text-primary hover:underline">
            Abrir Integrações
          </Link>
        </Section>

        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" asChild>
            <Link to="/automations">Cancelar</Link>
          </Button>
          <Button onClick={() => void create()} disabled={busy || !orgId}>
            {busy ? "A criar…" : "Criar e desenhar o fluxo"} <ArrowRight />
          </Button>
        </div>
      </div>
    </AppShell>
  );
}

function Section({ n, title, hint, children, className }: { n: number; title: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-card bg-card p-5", className)}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold ring-1 ring-[var(--border-subtle)]">
          {n}
        </span>
        <div>
          <h2 className="font-semibold leading-7">{title}</h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
      </div>
      <div className="space-y-3 pl-10">{children}</div>
    </section>
  );
}
