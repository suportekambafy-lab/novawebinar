import { useRef, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, ChevronRight, Copy, Flag, Link2, Loader2, Trash2, Upload, Users, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/data";
import whatsappIcon from "@/assets/local/whatsapp-icon.webp";
import { Field, Section, SwitchRow } from "../ui";
import type { EditorForm, FocusProps, SetForm } from "../form";

/** Início: o nome do webinar, o endereço da sala e quem apresenta. */
export function StepInicio({
  form,
  set,
  focus,
  roomOrigin,
  roomLink,
  uploading,
  onUpload,
  onDelete,
}: {
  form: EditorForm;
  set: SetForm;
  focus: FocusProps;
  roomOrigin: string;
  roomLink: string;
  uploading: boolean;
  onUpload: (file: File, field: "host_avatar_url" | "share_image_url") => void;
  onDelete: () => void;
}) {
  const avatarRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<"whatsapp" | "webhook" | null>(null);
  const copy = () => {
    void navigator.clipboard.writeText(roomLink);
    toast.success("Link copiado.");
  };
  const initials = form.host_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <>
      <Section icon={Flag} title="Webinar" help="webinar">
        <Field label="Título" required hint="É o que o público vê na página e na sala.">
          <Input value={form.public_title} onChange={(e) => set({ public_title: e.target.value })} {...focus("title")} />
        </Field>
        <Field label="Nome interno" hint="Só a sua equipa vê.">
          <Input value={form.internal_name} onChange={(e) => set({ internal_name: e.target.value })} />
        </Field>
        <Field label="Endereço da sala" required>
          <div className="flex min-w-0 gap-2">
            <div className="flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-sm bg-white shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-400)] focus-within:shadow-[inset_0_0_0_1px_var(--foreground)]">
              <span className="shrink-0 truncate pl-3 text-[13px] text-muted-foreground">{roomOrigin}/w/</span>
              <input
                value={form.slug}
                onChange={(e) => set({ slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                onBlur={(e) => {
                  set({ slug: slugify(e.target.value || form.public_title || form.internal_name) });
                  focus("url").onBlur();
                }}
                onFocus={focus("url").onFocus}
                className="h-full min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none"
                aria-label="Endereço da sala"
              />
            </div>
            <Button variant="outline" size="icon" onClick={copy} aria-label="Copiar o endereço" title="Copiar o endereço">
              <Copy />
            </Button>
          </div>
        </Field>
      </Section>

      <Section icon={Users} title="Quem apresenta" help="apresentador">
        <div className="flex items-center gap-3 rounded-xl border bg-white p-3">
          {form.host_avatar_url ? (
            <img src={form.host_avatar_url} alt="" className="size-12 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background">
              {initials || "?"}
            </span>
          )}
          <span className="min-w-0 flex-1">
            {/* Sem selo aqui: o selo é da sala e muda com o formato (Webinar ou Live). */}
            <b className="block truncate text-[15px] font-semibold">{form.host_name || "Quem apresenta"}</b>
            <span className="block truncate text-[12.5px] text-muted-foreground">{form.host_role || "Cargo"}</span>
          </span>
          <input
            ref={avatarRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file, "host_avatar_url");
              e.target.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={() => avatarRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            Foto
          </Button>
        </div>
        <Field label="Nome" hint="Uma pessoa ou a sua empresa.">
          <Input
            value={form.host_name}
            onChange={(e) => set({ host_name: e.target.value })}
            placeholder="Ex.: Amado Ruben ou Novawebinar"
            {...focus("host")}
          />
        </Field>
        <Field label="Descrição curta">
          <Input
            value={form.host_role}
            onChange={(e) => set({ host_role: e.target.value })}
            placeholder="Ex.: Estrategista de Negócios com IA"
            {...focus("host")}
          />
        </Field>
        <SwitchRow
          icon={BadgeCheck}
          title="Selo de verificado"
          description="Aparece ao lado do nome só na sala, no desenho de cada formato."
          checked={form.host_verified}
          onChange={(host_verified) => set({ host_verified })}
        />
      </Section>

      <Section icon={Link2} title="Partilha e ligações" help="partilha">
        <div className="divide-y overflow-hidden rounded-xl border bg-white">
          <LinkRow
            icon={<img src={whatsappIcon} alt="" className="size-4" />}
            title="Cartão do link"
            description="Como o link aparece no WhatsApp."
            on={Boolean(form.share_title || form.share_image_url)}
            onClick={() => setOpen("whatsapp")}
          />
          <LinkRow
            icon={<Webhook className="size-4" />}
            title="WebHook"
            description="Envia as entradas e os cliques na oferta."
            on={form.webhook_enabled && Boolean(form.webhook_url)}
            onClick={() => setOpen("webhook")}
          />
        </div>
      </Section>

      <Section>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Eliminar este webinar? Os inscritos, os comentários e as automações dele deixam de existir."))
              onDelete();
          }}
          className="inline-flex items-center gap-1.5 justify-self-start text-[12.5px] font-medium text-destructive hover:underline"
        >
          <Trash2 className="size-3.5" />
          Eliminar este webinar
        </button>
      </Section>

      <Dialog open={open === "whatsapp"} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[520px] grid-cols-[minmax(0,1fr)] overflow-y-auto p-5 sm:p-7">
          <DialogHeader>
            <DialogTitle className="pr-6 text-left text-base font-semibold">Cartão do link</DialogTitle>
            <DialogDescription className="text-left">
              Quando alguém partilha o link da sala no WhatsApp, aparece este cartão. Sem mudar nada, usa o título do
              webinar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 gap-4">
            <div className="min-w-0 rounded-xl bg-[#ece5dd] p-3 sm:p-4">
              <div className="w-full max-w-sm overflow-hidden rounded-xl rounded-tl-none bg-white p-1.5 shadow-sm">
                {form.share_image_url ? (
                  <img src={form.share_image_url} alt="" className="aspect-[1.91/1] w-full rounded-t-lg object-cover" />
                ) : null}
                <div className="border-l-4 border-[#25D366] bg-[#f0f2f5] px-3 py-2.5">
                  <p className="truncate text-sm font-semibold text-[#111b21]">
                    {form.share_title || form.public_title || "Título do webinar"}
                  </p>
                  {form.share_description ? (
                    <p className="truncate text-xs text-[#667781]">{form.share_description}</p>
                  ) : null}
                </div>
                <p className="truncate px-2 py-1.5 text-sm text-[#027eb5]">{roomLink}</p>
              </div>
            </div>
            <Field label="Título do cartão" hint="Vazio, usa o título do webinar.">
              <Input
                value={form.share_title}
                onChange={(e) => set({ share_title: e.target.value })}
                placeholder={form.public_title || "O título do webinar"}
              />
            </Field>
            <Field label="Frase por baixo" hint="Opcional. Ex.: «Ao vivo hoje às 20:00»">
              <Input
                value={form.share_description}
                onChange={(e) => set({ share_description: e.target.value })}
                placeholder="Opcional"
              />
            </Field>
            <ShareImage form={form} set={set} uploading={uploading} onUpload={(f) => onUpload(f, "share_image_url")} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open === "webhook"} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[520px] grid-cols-[minmax(0,1fr)] overflow-y-auto p-5 sm:p-7">
          <DialogHeader>
            <DialogTitle className="pr-6 text-left text-base font-semibold">WebHook</DialogTitle>
            <DialogDescription className="text-left">Recebe um aviso sempre que alguém entra ou clica na oferta.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <label className="flex items-center justify-between gap-4 rounded-xl border p-3.5">
              <span>
                <b className="block text-sm font-medium">Enviar</b>
                <span className="text-[12.5px] text-muted-foreground">Só envia com um endereço válido.</span>
              </span>
              <Switch checked={form.webhook_enabled} onCheckedChange={(v) => set({ webhook_enabled: v })} />
            </label>
            <Field label="Endereço" hint="Enviamos um pedido POST em JSON para este endereço.">
              <Input
                value={form.webhook_url}
                onChange={(e) => set({ webhook_url: e.target.value })}
                placeholder="https://o-seu-sistema.com/webhook"
              />
            </Field>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LinkRow({
  icon,
  title,
  description,
  on,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-gray-50">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-chip">{icon}</span>
      <span className="min-w-0 flex-1">
        <b className="block text-sm font-medium">{title}</b>
        <span className="block truncate text-xs text-muted-foreground">{description}</span>
      </span>
      <span className={cn("size-2 rounded-full", on ? "bg-[#25D366]" : "bg-gray-300")} title={on ? "Ligado" : "Por configurar"} />
      <ChevronRight className="size-4 text-muted-foreground" />
    </button>
  );
}

function ShareImage({
  form,
  set,
  uploading,
  onUpload,
}: {
  form: EditorForm;
  set: SetForm;
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Field label="Imagem">
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={uploading} onClick={() => ref.current?.click()}>
          {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
          {form.share_image_url ? "Trocar imagem" : "Carregar imagem"}
        </Button>
        {form.share_image_url ? (
          <Button variant="ghost" size="sm" onClick={() => set({ share_image_url: "" })}>
            <Trash2 />
            Remover
          </Button>
        ) : null}
      </div>
    </Field>
  );
}
