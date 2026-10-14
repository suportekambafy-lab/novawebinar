import {
  BarChart3,
  CalendarDays,
  Clock3,
  Copy,
  Eye,
  MoreHorizontal,
  Pencil,
  Play,
  Radio,
  Trash2,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/ds/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PageSkeleton } from "@/components/page-skeleton";
import {
  publicOrigin,
  lifecycleOf,
  statusFromLifecycle,
  type Webinar,
} from "@/lib/data";
import { lifecycleDetail, lifecycleLabel } from "@/lib/schedule";
import { friendlyError } from "@/lib/friendly-error";
import { smallImage } from "@/lib/shrink-image";
import { deleteWebinar } from "@/lib/webinar-delete.functions";

export { CalendarDays, Clock3, MoreHorizontal, Play, Radio, Users };

/**
 * Um número com o seu nome. O ícone só aparece quando diz alguma coisa (não há ícone
 * por omissão). No telemóvel é uma linha (nome à esquerda, número à direita), para
 * uma coluna de números não encher o ecrã.
 */
export function Metric({
  label,
  value,
  change,
  icon: Icon,
}: {
  label: string;
  value: string;
  change?: string;
  icon?: typeof Users;
}) {
  return (
    <article className="min-w-0 rounded-card bg-card p-4 max-sm:grid max-sm:grid-cols-[1fr_auto] max-sm:items-center max-sm:gap-x-4 sm:p-5 lg:p-6">
      <div className="flex min-w-0 items-start justify-between gap-3 max-sm:items-center">
        <span className="block text-sm leading-tight text-muted-foreground">{label}</span>
        {Icon && (
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-chip text-muted-foreground max-sm:hidden">
            <Icon className="size-4" strokeWidth={1.5} />
          </span>
        )}
      </div>
      <strong className="block break-words text-[22px] leading-none font-semibold tracking-[var(--tracking-display)] tabular-nums max-sm:col-start-2 max-sm:row-start-1 sm:mt-4 sm:text-[28px] lg:text-[32px]">
        {value}
      </strong>
      {change && <p className="mt-1 text-xs text-muted-foreground sm:mt-2">{change}</p>}
    </article>
  );
}

/** O estado vazio de uma página: o mesmo EmptyState do painel, com uma ligação como acção. */
export function EmptySection({
  title,
  description,
  icon,
  action,
  actionLabel,
  actionTo,
}: {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: ReactNode;
  actionLabel?: string;
  actionTo?: "/webinars/new" | "/library" | "/webinars" | "/support";
}) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      description={description}
      action={
        action ??
        (actionLabel && actionTo && (
          <Button asChild>
            <Link to={actionTo}>{actionLabel}</Link>
          </Button>
        ))
      }
    />
  );
}

export type WebinarRow = Webinar & {
  video_sources?: {
    name: string;
    source_url: string | null;
    duration_seconds: number;
    provider: string;
  } | null;
  participantCount?: number;
};

/** O ciclo de vida do webinar agora, com as horas na dica. */
export function LifecycleBadge({ webinar }: { webinar: WebinarRow }) {
  const lifecycle = lifecycleOf(webinar);
  const live = lifecycle.kind === "session" && lifecycle.state === "live";
  return (
    <Badge
      variant={live ? "destructive" : lifecycle.kind === "draft" ? "outline" : "secondary"}
      title={lifecycleDetail(lifecycle, webinar.timezone)}
    >
      {live && <span className="size-1.5 animate-pulse rounded-full bg-current" aria-hidden />}
      {lifecycleLabel(lifecycle)}
    </Badge>
  );
}

function ActiveSwitch({ webinar }: { webinar: WebinarRow }) {
  const queryClient = useQueryClient();
  const active = webinar.status !== "draft";
  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      // Ao ativar, o estado segue o ciclo de vida: sessão futura → agendado (sala de
      // espera), já iniciada → ao vivo; sem horário (sob demanda) ou just in time → ao vivo.
      const status = next
        ? statusFromLifecycle(lifecycleOf({ ...webinar, status: null }), webinar.replay_enabled)
        : "draft";
      // Marca a versão: um editor aberto com a versão anterior não guarda por cima deste estado.
      const { error } = await supabase.from("webinars").update({ status, updated_at: new Date().toISOString() }).eq("id", webinar.id);
      if (error) throw error;
    },
    onSuccess: (_data, next) => {
      void queryClient.invalidateQueries({ queryKey: ["webinars"] });
      void queryClient.invalidateQueries({ queryKey: ["webinar", webinar.id] });
      toast.success(next ? "Webinar ativado" : "Webinar inativado");
    },
    onError: () => toast.error("Não foi possível alterar o estado"),
  });
  // O interruptor já diz se está activo; o distintivo ao lado diz o momento (Agendado, Inativo…).
  return (
    <Switch
      checked={active}
      disabled={toggle.isPending}
      onCheckedChange={(next) => toggle.mutate(next)}
      aria-label={active ? "Inativar webinar" : "Ativar webinar"}
    />
  );
}

function LinkField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex gap-2">
        <Input
          readOnly
          value={value}
          className="text-sm"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={`Copiar: ${label}`}
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success("Endereço copiado");
          }}
        >
          <Copy />
        </Button>
      </div>
    </div>
  );
}

function WebinarDetailsDialog({
  webinar,
  open,
  onOpenChange,
}: {
  webinar: WebinarRow | null;
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const origin = publicOrigin();
  if (!webinar) return null;
  const roomLink = `${origin}/w/${webinar.slug}`;
  // A sala de teste vive no mesmo domínio público das salas: qualquer pessoa
  // com o link entra, mesmo com a sessão inativa ou fora do horário.
  const testLink = `${roomLink}?teste=1`;
  const testReplayLink = `${roomLink}?teste=1&replay=1`;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{webinar.public_title || webinar.internal_name}</SheetTitle>
          <SheetDescription>Endereços e atalhos desta sessão.</SheetDescription>
        </SheetHeader>
        <div className="space-y-4">
          <LinkField label="Sala principal" value={roomLink} />
          {webinar.replay_enabled ? (
            <LinkField label="Replay" value={`${roomLink}?replay=1`} />
          ) : (
            <p className="text-sm text-muted-foreground">
              O replay está desligado neste webinar. Ative-o na edição para gerar o endereço.
            </p>
          )}
          <LinkField label="Sala de teste" value={testLink} />
          <LinkField label="Sala de teste (replay)" value={testReplayLink} />
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" asChild>
              <Link to="/webinars/$webinarId/edit" params={{ webinarId: webinar.id }}>
                Editar webinar
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={roomLink} target="_blank" rel="noreferrer" aria-label="Abrir sala (abre numa nova janela)">
                Abrir sala
              </a>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Capa na lista (mostrada a 44–48 px): pequena pelo optimizador da Vercel; se ele não responder, a original. */
function CoverThumb({ url, alt, className }: { url: string; alt: string; className: string }) {
  return (
    <img
      src={import.meta.env.PROD ? smallImage(url) : url}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={(e) => {
        if (e.currentTarget.src !== url) e.currentTarget.src = url;
      }}
    />
  );
}

function DeleteWebinarButton({ webinar }: { webinar: WebinarRow }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    // No servidor, com a permissão confirmada; se parar a meio, diz o que ficou e repetir continua.
    mutationFn: async () => {
      const result = await deleteWebinar({ data: { webinarId: webinar.id } });
      if (!result.ok) throw new Error(`${result.error} Ficou por apagar: ${result.remaining.join(", ")}. Tente outra vez.`);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["webinars"] }),
    onSuccess: () => toast.success("Webinar eliminado"),
    onError: (error) => toast.error(friendlyError(error, "Não foi possível eliminar o webinar")),
  });
  return (
    <Button
      variant="ghost"
      size="icon"
      title="Eliminar"
      aria-label="Eliminar"
      className="text-destructive hover:text-destructive"
      disabled={remove.isPending}
      onClick={() => {
        if (
          window.confirm(
            `Eliminar "${webinar.public_title || webinar.internal_name}"? Esta ação não pode ser anulada.`,
          )
        ) {
          remove.mutate();
        }
      }}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

export function WebinarTable({
  rows,
  title = "Webinars recentes",
  loading,
}: {
  rows: WebinarRow[];
  title?: string;
  loading?: boolean;
}) {
  const [selected, setSelected] = useState<WebinarRow | null>(null);
  return (
    <div className="overflow-hidden rounded-card bg-card">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
        <div>
          <h2 className="text-base font-semibold tracking-[var(--tracking-title)]">{title}</h2>
          {!loading && (
            <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
              {rows.length} {rows.length === 1 ? "webinar" : "webinars"}
            </p>
          )}
        </div>
      </div>
      {loading ? (
        <PageSkeleton variant="table" className="rounded-none border-0" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Video}
          title="Nenhum webinar aqui"
          description="Escolha outro separador ou procure por outro nome."
          className="bg-transparent pt-6 pb-10"
        />
      ) : (
        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-normal">Webinar</th>
                <th className="px-5 py-3 font-normal">Estado</th>
                <th className="px-5 py-3 font-normal">Vídeo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="border-t border-[var(--border-subtle)] transition-colors hover:bg-gray-50">
                  <td className="px-6 py-3.5">
                    <div className="flex items-center gap-3">
                      {w.registration_cover_url ? (
                        <CoverThumb
                          url={w.registration_cover_url}
                          alt={`Capa de ${w.public_title || w.internal_name}`}
                          className="size-11 shrink-0 rounded-sm object-cover"
                        />
                      ) : (
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-gray-100 text-gray-700">
                          <Play className="size-4" strokeWidth={1.5} />
                        </span>
                      )}
                      <span className="min-w-0 line-clamp-2">{w.public_title || w.internal_name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <ActiveSwitch webinar={w} />
                      <LifecycleBadge webinar={w} />
                    </div>
                  </td>
                  <td className="max-w-[180px] truncate px-5 py-4 text-muted-foreground">
                    {w.video_sources?.name ?? "Por definir"}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Detalhes"
                        aria-label="Detalhes"
                        onClick={() => setSelected(w)}
                      >
                        <Eye className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Editar"
                        aria-label="Editar"
                        asChild
                      >
                        <Link to="/webinars/$webinarId/edit" params={{ webinarId: w.id }}>
                          <Pencil className="size-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Métricas do webinar"
                        aria-label="Métricas do webinar"
                        asChild
                      >
                        <Link to="/webinars/$webinarId/metrics" params={{ webinarId: w.id }}>
                          <BarChart3 className="size-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Métricas em tempo real"
                        aria-label="Métricas em tempo real"
                        asChild
                      >
                        <Link to="/live-view" search={{ webinar: w.id }}>
                          <Radio className="size-4" />
                        </Link>
                      </Button>
                      <DeleteWebinarButton webinar={w} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && rows.length > 0 && (
        <div className="divide-y divide-[var(--border-subtle)] lg:hidden">
          {rows.map((w) => (
            <article key={w.id} className="p-4">
              <div className="flex items-start gap-3">
                {w.registration_cover_url ? (
                  <CoverThumb url={w.registration_cover_url} alt="" className="size-12 shrink-0 rounded-sm object-cover" />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-sm bg-gray-100 text-gray-700">
                    <Play className="size-4" strokeWidth={1.5} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">
                    {w.public_title || w.internal_name}
                  </h3>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {w.video_sources?.name ?? "Vídeo por definir"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Detalhes"
                  onClick={() => setSelected(w)}
                >
                  <MoreHorizontal />
                </Button>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <ActiveSwitch webinar={w} />
                  <LifecycleBadge webinar={w} />
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/webinars/$webinarId/edit" params={{ webinarId: w.id }}>
                    Editar
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      <WebinarDetailsDialog
        webinar={selected}
        open={Boolean(selected)}
        onOpenChange={(value) => !value && setSelected(null)}
      />
    </div>
  );
}
