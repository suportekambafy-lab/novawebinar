import { useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Braces,
  Check,
  ChevronDown,
  Code2,
  Contact,
  Copy,
  FileText,
  Image as ImageIcon,
  Link2,
  Loader2,
  Palette,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  BASE_KINDS,
  FIELD_ICON_KEYS,
  FIELD_KINDS,
  MAX_FIELDS,
  NOTICE_TEXT_MAX,
  entryFieldsProblem,
  entryNotice,
  fieldApiKey,
  fieldIcon,
  newFieldId,
  type EntryField,
  type EntryFieldKind,
  type FieldIconKey,
} from "@/lib/entry-fields";
import { ENTRY_BUTTON_DEFAULT, ENTRY_CARD_DEFAULT } from "@/lib/room-logic";
import { FieldIcon } from "@/components/room/entry-screen";
import { Field, Note, RadioCard, Section, Seg, SwitchRow, Swatches } from "../ui";
import type { EditorForm, FocusProps, SetForm } from "../form";

/** Página: onde as pessoas se inscrevem, os campos que preenchem, o botão e as cores. */
export function StepEntrada({
  form,
  set,
  focus,
  fields,
  onFields,
  colors,
  onColors,
  mode,
  onMode,
  upload,
  roomLink,
  embed,
}: {
  form: EditorForm;
  set: SetForm;
  focus: FocusProps;
  fields: readonly EntryField[];
  onFields: (fields: EntryField[]) => void;
  colors: { card: string; button: string };
  onColors: (colors: { card: string; button: string }) => void;
  mode: "page" | "own";
  onMode: (mode: "page" | "own") => void;
  /** A capa da página (e do webinar na lista): o envio corre no editor, que reduz e guarda a imagem. */
  upload: { uploading: boolean; onFile: (file: File) => void };
  roomLink: string;
  /** O formulário para colar numa página externa (criado quando falta). */
  embed: { code: string | null; formId: string | null; creating: boolean; onCreate: () => void };
}) {
  const own = mode === "own";
  const problem = entryFieldsProblem(fields);
  // O aviso no topo: ligado/desligado e o tipo ficam aqui, para o campo de texto poder ficar vazio enquanto se escreve.
  const saved = entryNotice(form);
  const [notice, setNotice] = useState<{ on: boolean; kind: "progress" | "text" }>({
    on: saved !== null,
    kind: saved?.kind ?? "progress",
  });
  const showNotice = (on: boolean, kind = notice.kind) => {
    setNotice({ on, kind });
    set({
      registration_progress_enabled: on && kind === "progress",
      registration_badge_text: !on
        ? ""
        : kind === "text"
          ? form.registration_badge_text.trim() || "Vagas limitadas"
          : form.registration_badge_text,
    });
  };
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(`${what} copiado.`);
  };
  const update = (id: string, patch: Partial<EntryField>) =>
    onFields(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const remove = (id: string) => {
    const next = fields.filter((f) => f.id !== id);
    const issue = entryFieldsProblem(next);
    if (issue) {
      toast.error(issue);
      return;
    }
    onFields(next);
  };
  /** Um campo novo: escreve-se o nome e escolhe-se o ícone. */
  const addCustom = () => {
    if (fields.length >= MAX_FIELDS) {
      toast.error(`No máximo ${MAX_FIELDS} campos.`);
      return;
    }
    const id = newFieldId();
    onFields([...fields, { id, kind: "text", label: "", required: false, icon: "help" }]);
    setJustAdded(id);
  };
  /** Voltar a pôr o nome, o e-mail ou o WhatsApp. */
  const restore = (kind: EntryFieldKind) => {
    if (fields.length >= MAX_FIELDS) {
      toast.error(`No máximo ${MAX_FIELDS} campos.`);
      return;
    }
    onFields([
      ...fields,
      { id: kind, kind, label: FIELD_KINDS[kind].label, required: kind !== "whatsapp" },
    ]);
  };
  const missingBase = BASE_KINDS.filter((kind) => !fields.some((f) => f.kind === kind));

  return (
    <>
      <section
        className="grid gap-2 pb-[18px]"
        role="radiogroup"
        aria-label="Onde as pessoas se inscrevem"
      >
        <RadioCard
          icon={FileText}
          title="Página do Novawebinar"
          description="Feita aqui: título, campos e botão."
          selected={mode === "page"}
          onSelect={() => onMode("page")}
        />
        <RadioCard
          icon={Link2}
          title="Página externa"
          description="A sua página, com o nosso formulário."
          selected={own}
          onSelect={() => onMode("own")}
        />
      </section>

      {own ? (
        <Section title="Em 3 passos" help="ligarPagina">
          <ol className="divide-y overflow-hidden rounded-xl border bg-white">
            <StepRow n={1} title="Configure aqui">
              <p className="text-[12.5px] text-muted-foreground">
                Os campos, o texto e a cor do botão, mais abaixo.
              </p>
            </StepRow>
            <StepRow n={2} title="Copie para a sua página">
              <div className="divide-y overflow-hidden rounded-lg border">
                {embed.code ? (
                  <CopyRow
                    icon={Code2}
                    title="Código"
                    value={embed.code}
                    onCopy={() => copy(embed.code!, "Código")}
                  />
                ) : (
                  <div className="flex items-center gap-3 px-3.5 py-3">
                    <Code2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 text-sm font-medium">Código</span>
                    <Button
                      size="sm"
                      variant="dark"
                      onClick={embed.onCreate}
                      disabled={embed.creating}
                    >
                      Criar o formulário
                    </Button>
                  </div>
                )}
                <CopyRow
                  icon={Link2}
                  title="Link da sala"
                  value={roomLink}
                  onCopy={() => copy(roomLink, "Link")}
                />
                {embed.formId ? (
                  <ApiRow
                    curl={apiExample(roomLink.replace(/\/w\/.*$/, ""), embed.formId, fields)}
                    onCopy={(code) => copy(code, "Pedido")}
                  />
                ) : null}
              </div>
            </StepRow>
            <StepRow n={3} title="Confirme que funciona">
              <LastCapture formId={embed.formId} draft={form.status === "draft"} />
            </StepRow>
          </ol>
        </Section>
      ) : null}

      <CoverSection form={form} set={set} uploading={upload.uploading} onUpload={upload.onFile} />

      <Section icon={Contact} title="Captar contactos" help="contactos">
        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-2 border-b bg-gray-50 px-3 py-2 text-[11.5px] font-medium text-muted-foreground">
            <span>Campo</span>
            <span>Obrigatório</span>
            <span />
          </div>
          {fields.map((field) => (
            <div
              key={field.id}
              className="grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-2 border-b px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <IconPicker field={field} onIcon={(icon) => update(field.id, { icon })} />
                <input
                  value={field.label}
                  autoFocus={justAdded === field.id}
                  onChange={(e) => update(field.id, { label: e.target.value.slice(0, 60) })}
                  onBlur={(e) => {
                    if (!e.target.value.trim())
                      update(field.id, {
                        label:
                          field.kind === "text" ? "Nova pergunta" : FIELD_KINDS[field.kind].label,
                      });
                    if (justAdded === field.id) setJustAdded(null);
                  }}
                  placeholder="Escreva o nome do campo"
                  aria-label="Nome do campo"
                  className="h-8 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-sm font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground hover:bg-gray-50 focus:bg-white focus:shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-400)]"
                />
              </span>
              <Switch
                checked={field.required}
                onCheckedChange={(required) => update(field.id, { required })}
                aria-label={`${field.label || "Campo"} obrigatório`}
              />
              <button
                type="button"
                onClick={() => remove(field.id)}
                aria-label={`Tirar ${field.label || "o campo"}`}
                title="Tirar o campo"
                className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-[var(--ds-gray-alpha-200)] hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addCustom}
            disabled={fields.length >= MAX_FIELDS}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-foreground hover:bg-gray-50 disabled:opacity-40"
          >
            <span className="grid size-7 place-items-center rounded-full bg-foreground text-background">
              <Plus className="size-3.5" />
            </span>
            Adicionar campo
            <span className="ml-auto text-[12px] font-normal text-muted-foreground">
              {fields.length}/{MAX_FIELDS}
            </span>
          </button>
        </div>
        {missingBase.length ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
            Repor:
            {missingBase.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => restore(kind)}
                className="inline-flex h-7 items-center gap-1.5 rounded-full border bg-white px-2.5 font-medium text-foreground hover:bg-gray-50"
              >
                <FieldIcon kind={kind} className="size-3.5" />
                {FIELD_KINDS[kind].label}
              </button>
            ))}
          </div>
        ) : null}
        {problem ? <p className="text-[12.5px] text-warning">{problem}</p> : null}
        <p className="text-[12.5px] text-muted-foreground">
          Clique no ícone para o trocar e no nome para escrever o que quiser. Na página, os
          obrigatórios levam *.
        </p>
      </Section>

      <Section icon={ShoppingCart} title="Botão" help="botaoVagas">
        <Field label="Texto do botão">
          <Input
            value={form.registration_button_text}
            onChange={(e) => set({ registration_button_text: e.target.value })}
            {...focus("button")}
          />
        </Field>
        {/* O aviso só existe na página do Novawebinar: o formulário externo não o leva. */}
        {own ? null : (
          <>
            <SwitchRow
              title="Aviso no topo"
              checked={notice.on}
              onChange={(on) => showNotice(on)}
            />
            {notice.on ? (
              <div className="flex flex-wrap items-center gap-2">
                <Seg
                  small
                  label="Tipo de aviso"
                  value={notice.kind}
                  onChange={(kind) => showNotice(true, kind)}
                  options={[
                    { value: "progress", label: "Vagas (%)" },
                    { value: "text", label: "Texto" },
                  ]}
                />
                {notice.kind === "progress" ? (
                  <div className="flex h-9 w-[84px] items-center rounded-sm bg-white pr-2.5 shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-400)]">
                    <input
                      inputMode="numeric"
                      value={form.registration_progress_value}
                      onChange={(e) =>
                        set({
                          registration_progress_value: e.target.value
                            .replace(/\D/g, "")
                            .slice(0, 3),
                        })
                      }
                      {...focus("progress")}
                      className="h-full w-full min-w-0 bg-transparent pl-3 text-sm outline-none"
                      aria-label="Percentagem de vagas preenchidas"
                    />
                    <span className="text-[13px] text-muted-foreground">%</span>
                  </div>
                ) : (
                  <Input
                    value={form.registration_badge_text}
                    maxLength={NOTICE_TEXT_MAX}
                    onChange={(e) =>
                      set({ registration_badge_text: e.target.value.slice(0, NOTICE_TEXT_MAX) })
                    }
                    {...focus("progress")}
                    placeholder="Vagas limitadas"
                    aria-label="Texto do aviso"
                    className="h-9 min-w-[160px] flex-1"
                  />
                )}
              </div>
            ) : null}
          </>
        )}
      </Section>

      <Section icon={Palette} title="Cores" help="coresPagina">
        {own ? null : (
          <Swatches
            label="Cartão"
            value={colors.card}
            onChange={(card) => onColors({ ...colors, card })}
            options={[ENTRY_CARD_DEFAULT, "#FFFFFF", "#0B1322", "#0D2119", "#F6F1EA"]}
          />
        )}
        <Swatches
          label="Botão"
          value={colors.button}
          onChange={(button) => onColors({ ...colors, button })}
          options={[ENTRY_BUTTON_DEFAULT, "#171717", "#2563EB", "#16A34A", "#E5484D"]}
        />
        <p className="text-[12.5px] text-muted-foreground">
          {own
            ? "O texto do botão ajusta-se sozinho à cor."
            : "O texto ajusta-se sozinho à cor. No tema claro, o cartão escuro passa a branco."}
        </p>
      </Section>
    </>
  );
}

/** O ícone do campo: abre um pop-up com os ícones para escolher. */
function IconPicker({
  field,
  onIcon,
}: {
  field: EntryField;
  onIcon: (icon: FieldIconKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = fieldIcon(field);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Escolher o ícone do campo"
          title="Escolher o ícone"
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-full transition hover:ring-1 hover:ring-foreground/30",
            current === "whatsapp" ? "bg-[#25D366]/15" : "bg-chip",
          )}
        >
          <FieldIcon kind={field.kind} icon={field.icon} className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[260px] p-2.5">
        <p className="px-0.5 pb-2 text-[12.5px] font-semibold">Ícone do campo</p>
        <div className="grid grid-cols-6 gap-1">
          {FIELD_ICON_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                onIcon(key);
                setOpen(false);
              }}
              aria-label={key}
              className={cn(
                "grid size-9 place-items-center rounded-lg transition hover:bg-accent",
                key === current && "bg-foreground text-background hover:bg-foreground",
              )}
            >
              <FieldIcon kind="text" icon={key} className="size-[18px]" />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CopyRow({
  icon: Icon,
  title,
  value,
  onCopy,
}: {
  icon: typeof Link2;
  title: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3.5 py-2.5">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <b className="block text-sm font-medium">{title}</b>
        <span className="block truncate font-mono text-[11.5px] text-muted-foreground">
          {value}
        </span>
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={onCopy}
        aria-label={`Copiar: ${title}`}
      >
        <Copy />
      </Button>
    </div>
  );
}

/** Um passo numerado da página externa. */
function StepRow({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-3 gap-y-2 px-3.5 py-3">
      <span className="grid size-[22px] place-items-center rounded-full bg-foreground text-[12px] font-semibold text-background">
        {n}
      </span>
      <b className="self-center text-sm font-semibold">{title}</b>
      <div className="col-start-2 grid min-w-0 gap-2">{children}</div>
    </li>
  );
}

/** O pedido de exemplo para quem já tem o seu formulário: os nomes dos campos desta página. */
function apiExample(origin: string, formId: string, fields: readonly EntryField[]) {
  const sample = (field: EntryField) =>
    field.kind === "name"
      ? "Ana Paula"
      : field.kind === "email"
        ? "ana@exemplo.com"
        : field.kind === "whatsapp"
          ? "+244 923 000 111"
          : "Resposta";
  const base = fields.filter((f) => BASE_KINDS.includes(f.kind));
  const extra = fields.filter((f) => !BASE_KINDS.includes(f.kind));
  const body = {
    form_id: formId,
    ...Object.fromEntries(base.map((f) => [fieldApiKey(f), sample(f)])),
    ...(extra.length
      ? { answers: Object.fromEntries(extra.map((f) => [fieldApiKey(f), sample(f)])) }
      : {}),
  };
  return `curl -X POST ${origin}/api/public/register \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(body, null, 2).replace(/\n/g, "\n  ")}'`;
}

/** A API, fechada por omissão: só quem programa a abre. */
function ApiRow({ curl, onCopy }: { curl: string; onCopy: (code: string) => void }) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
        <Braces className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          <b className="block text-sm font-medium">API</b>
          <span className="block truncate text-[11.5px] text-muted-foreground">
            Para quem já tem o seu formulário
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <div className="border-t bg-gray-50">
        <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed">{curl}</pre>
        <div className="flex justify-end px-1.5 pb-1.5">
          <Button variant="ghost" size="sm" onClick={() => onCopy(curl)}>
            <Copy /> Copiar
          </Button>
        </div>
      </div>
    </details>
  );
}

const WHEN = new Intl.DateTimeFormat("pt-PT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** A prova: a última inscrição que chegou pela página externa (formulário ou API). */
function LastCapture({ formId, draft }: { formId: string | null; draft: boolean }) {
  const last = useQuery({
    queryKey: ["registration-forms", "last-capture", formId],
    enabled: Boolean(formId),
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("participants")
        .select("name, joined_at")
        .eq("form_id", formId!)
        .in("registration_source", ["embed", "api"])
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  if (!formId)
    return (
      <p className="text-[12.5px] text-muted-foreground">Primeiro, crie o formulário no passo 2.</p>
    );
  // Em rascunho o formulário não aparece na página externa: ainda não há nada para testar.
  if (draft && !last.data)
    return (
      <Note tone="warn">
        Em rascunho, o formulário não aparece na sua página: publique primeiro.
      </Note>
    );
  return last.data ? (
    <p className="flex items-center gap-2 text-[13px]">
      <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#1D8A5E] text-white">
        <Check className="size-3" strokeWidth={3} />
      </span>
      <span className="min-w-0 truncate">
        Chegou: <b className="font-semibold">{last.data.name}</b>
        <span className="text-muted-foreground">
          {" "}
          · {WHEN.format(new Date(last.data.joined_at))}
        </span>
      </span>
    </p>
  ) : (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[12.5px] text-muted-foreground">
        {last.isLoading
          ? "A procurar…"
          : last.isError
            ? "Não foi possível ver as inscrições."
            : "Ainda sem inscrições: faça uma de teste."}
      </p>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => void last.refetch()}
        disabled={last.isFetching}
        className="size-8 shrink-0"
        aria-label="Ver de novo"
        title="Ver de novo"
      >
        <RefreshCw className={cn(last.isFetching && "animate-spin")} />
      </Button>
    </div>
  );
}

/** A capa: por cima do formulário na página de inscrição e, na lista de webinars, a imagem do webinar. */
function CoverSection({
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
    <Section icon={ImageIcon} title="Capa">
      <Field label="Imagem no topo da página" hint="Fica por cima do formulário e é a capa do webinar na lista. Formato 16:9.">
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
        {form.registration_cover_url ? (
          <img src={form.registration_cover_url} alt="" className="mb-2 aspect-video w-full max-w-[320px] rounded-md object-cover ring-1 ring-[var(--border-subtle)]" />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => ref.current?.click()}>
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            {form.registration_cover_url ? "Trocar capa" : "Carregar capa"}
          </Button>
          {form.registration_cover_url ? (
            <Button variant="ghost" size="sm" onClick={() => set({ registration_cover_url: "" })}>
              <Trash2 />
              Remover
            </Button>
          ) : null}
        </div>
      </Field>
    </Section>
  );
}
