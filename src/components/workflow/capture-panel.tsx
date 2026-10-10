import { useQuery } from "@tanstack/react-query";
import { Check, ClipboardList, Code2, Copy, Globe } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { publicOrigin, saveRegistrationForm, useInvalidate, type RegistrationForm } from "@/lib/data";
import { friendlyError } from "@/lib/friendly-error";

/** Inscrições que entraram por cada formulário, por origem (embed ou API). */
function useFormRegistrations(formId: string) {
  return useQuery({
    queryKey: ["workflows", "form-registrations", formId],
    refetchInterval: 20_000,
    queryFn: async () => {
      const count = async (source: string) => {
        const { count: n, error } = await supabase
          .from("participants")
          .select("id", { count: "exact", head: true })
          .eq("form_id", formId)
          .eq("registration_source", source);
        if (error) throw error;
        return n ?? 0;
      };
      const [embed, api] = await Promise.all([count("embed"), count("api")]);
      return { embed, api };
    },
  });
}

function CopyBlock({ label, code }: { label: string; code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copiado" : "Copiar"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md bg-navy p-4 text-[11px] leading-relaxed text-white">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function CapturePanel({ forms, webinarTitle }: { forms: RegistrationForm[]; webinarTitle: string }) {
  if (!forms.length)
    return <p className="text-sm text-muted-foreground">Este webinar ainda não tem formulário. Crie a automação base para o gerar.</p>;
  return (
    <div className="space-y-6">
      {forms.map((form) => (
        <FormCard key={form.id} form={form} webinarTitle={webinarTitle} />
      ))}
    </div>
  );
}

function FormCard({ form, webinarTitle }: { form: RegistrationForm; webinarTitle: string }) {
  const invalidate = useInvalidate();
  const [draft, setDraft] = useState(form);
  useEffect(() => setDraft(form), [form]);
  const regs = useFormRegistrations(form.id);
  const origin = publicOrigin();
  const dirty = JSON.stringify(draft) !== JSON.stringify(form);

  const save = async () => {
    try {
      await saveRegistrationForm(form.id, {
        name: draft.name.trim() || "Formulário de inscrição",
        page_name: draft.page_name?.trim() || null,
        page_url: draft.page_url?.trim() || null,
        allowed_origins: draft.allowed_origins.map((o) => o.trim()).filter(Boolean),
        consent_text: draft.consent_text?.trim() || null,
        success_message: draft.success_message?.trim() || null,
        redirect_url: draft.redirect_url?.trim() || null,
        active: draft.active,
      });
      invalidate(["workflows"]);
      toast.success("Formulário guardado");
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível guardar o formulário."));
    }
  };

  const embed = `<div data-novawebinar-form="${form.id}"></div>\n<script src="${origin}/api/public/forms/${form.id}/embed" async></script>`;
  const api = `curl -X POST ${origin}/api/public/register \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "form_id": "${form.id}",\n    "name": "Nome da pessoa",\n    "email": "pessoa@exemplo.com",\n    "phone": "+244 900 000 000",\n    "consent": true,\n    "submission_id": "id-único-da-submissão",\n    "utm_source": "facebook", "utm_medium": "cpc", "utm_campaign": "webinar-ia",\n    "utm_content": "video-1", "utm_term": "ia",\n    "referrer": "https://facebook.com/"\n  }'`;

  return (
    <section className="grid gap-5 rounded-card bg-card p-5 lg:grid-cols-[1fr_1.1fr]">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-sm border border-dashed border-gray-400 bg-white text-foreground">
              <ClipboardList className="size-4.5" aria-hidden />
            </span>
            <div>
              <h3 className="font-semibold">{form.name}</h3>
              <p className="text-xs text-muted-foreground">Inscreve em «{webinarTitle}» · a organização vem do formulário</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium">
            {draft.active ? "Aceita inscrições" : "Desligado"}
            <Switch checked={draft.active} onCheckedChange={(active) => setDraft({ ...draft, active })} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-md bg-gray-100 p-3 text-center">
          <div>
            <p className="text-xl font-semibold tabular-nums">{regs.data?.embed ?? "—"}</p>
            <p className="text-xs text-muted-foreground">pelo formulário embed</p>
          </div>
          <div>
            <p className="text-xl font-semibold tabular-nums">{regs.data?.api ?? "—"}</p>
            <p className="text-xs text-muted-foreground">pela API</p>
          </div>
        </div>
        <fieldset className="space-y-3">
          <legend className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <Globe className="size-4" aria-hidden /> Página externa
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`pn-${form.id}`}>Nome da página</Label>
              <Input id={`pn-${form.id}`} value={draft.page_name ?? ""} placeholder="Página de inscrição" onChange={(e) => setDraft({ ...draft, page_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`pu-${form.id}`}>URL da página</Label>
              <Input id={`pu-${form.id}`} value={draft.page_url ?? ""} placeholder="https://meusite.com/webinar-ia" onChange={(e) => setDraft({ ...draft, page_url: e.target.value })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ao-${form.id}`}>Origens autorizadas (uma por linha; vazio = qualquer)</Label>
            <Textarea
              id={`ao-${form.id}`}
              rows={2}
              value={draft.allowed_origins.join("\n")}
              placeholder="https://meusite.com"
              onChange={(e) => setDraft({ ...draft, allowed_origins: e.target.value.split("\n") })}
            />
          </div>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-1 text-sm font-semibold">Confirmação</legend>
          <p className="text-xs text-muted-foreground">
            Os campos pedidos (nome, e-mail, WhatsApp e os extra) são os da etapa Página do editor do webinar: os mesmos na sala,
            no formulário embed e na API.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`ct-${form.id}`}>Texto de consentimento (com texto, passa a ser obrigatório e fica gravado)</Label>
            <Input id={`ct-${form.id}`} value={draft.consent_text ?? ""} placeholder="Aceito receber comunicações sobre este webinar." onChange={(e) => setDraft({ ...draft, consent_text: e.target.value })} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`sm-${form.id}`}>Mensagem de sucesso</Label>
              <Input id={`sm-${form.id}`} value={draft.success_message ?? ""} placeholder="Inscrição confirmada." onChange={(e) => setDraft({ ...draft, success_message: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ru-${form.id}`}>Página de confirmação (redirecionar)</Label>
              <Input id={`ru-${form.id}`} value={draft.redirect_url ?? ""} placeholder="https://meusite.com/obrigado" onChange={(e) => setDraft({ ...draft, redirect_url: e.target.value })} />
            </div>
          </div>
        </fieldset>
        <Button onClick={() => void save()} disabled={!dirty}>
          Guardar formulário
        </Button>
      </div>
      <div className="space-y-4">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <Code2 className="size-4" aria-hidden /> Colocar na página
        </div>
        <CopyBlock label="A. Formulário embed (WordPress, Elementor, Framer, Webflow, HTML)" code={embed} />
        <p className="text-xs text-muted-foreground">
          O script lê sozinho as UTM do endereço da página, o referrer e o dispositivo. Não é preciso escrever UTM à mão.
        </p>
        <CopyBlock label="B. API (quem já tem o seu próprio formulário)" code={api} />
        <p className="text-xs text-muted-foreground">
          Resposta: <code>201</code> inscrito · <code>200</code> já estava inscrito (mesma pessoa na mesma sessão, ou a mesma
          submissão repetida) · <code>400</code> campos inválidos · <code>403</code> origem não autorizada · <code>404</code>{" "}
          formulário ou webinar indisponível · <code>429</code> demasiadas inscrições seguidas. Com sucesso traz{" "}
          <code>contact_id</code> e <code>registration_id</code>.
        </p>
        <p className="text-xs text-muted-foreground">
          Sem formulário: envie <code>webinar_id</code> em vez de <code>form_id</code>. Para repetir um pedido sem criar outra
          inscrição, use o mesmo <code>submission_id</code> ou o cabeçalho <code>Idempotency-Key</code>. A organização vem
          sempre do formulário ou do webinar, nunca do pedido.
        </p>
      </div>
    </section>
  );
}
