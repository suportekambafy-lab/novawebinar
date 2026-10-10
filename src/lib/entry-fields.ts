/**
 * Os campos que a pessoa preenche para entrar na sala, sem ecrã. O organizador escolhe quais
 * (nome, e-mail, WhatsApp e campos novos com ícone), o nome de cada um e se é obrigatório.
 * A página pública, o editor e o servidor validam com as mesmas regras.
 */

export type EntryFieldKind =
  | "name"
  | "email"
  | "whatsapp"
  | "text"
  | "phone"
  | "location"
  | "company"
  | "job"
  | "instagram"
  | "date";

export type EntryField = {
  id: string;
  kind: EntryFieldKind;
  label: string;
  required: boolean;
  /** O ícone escolhido pelo organizador (uma chave de FIELD_ICON_KEYS); sem ele, o do tipo. */
  icon?: string | undefined;
};

/** Os ícones que o organizador pode dar a um campo. */
export const FIELD_ICON_KEYS = [
  "user",
  "mail",
  "whatsapp",
  "phone",
  "pin",
  "building",
  "briefcase",
  "instagram",
  "tiktok",
  "facebook",
  "linkedin",
  "youtube",
  "calendar",
  "globe",
  "school",
  "target",
  "wallet",
  "users",
  "heart",
  "star",
  "chat",
  "hash",
  "home",
  "gift",
  "book",
  "link",
  "idea",
  "help",
] as const;
export type FieldIconKey = (typeof FIELD_ICON_KEYS)[number];

/** O ícone de cada tipo, quando o organizador não escolheu outro. */
export const KIND_ICON: Record<EntryFieldKind, FieldIconKey> = {
  name: "user",
  email: "mail",
  whatsapp: "whatsapp",
  text: "help",
  phone: "phone",
  location: "pin",
  company: "building",
  job: "briefcase",
  instagram: "instagram",
  date: "calendar",
};

export function fieldIcon(field: Pick<EntryField, "kind" | "icon">): FieldIconKey {
  return (FIELD_ICON_KEYS as readonly string[]).includes(field.icon ?? "") ? (field.icon as FieldIconKey) : KIND_ICON[field.kind];
}

export const FIELD_KINDS: Record<
  EntryFieldKind,
  { label: string; placeholder: string; input: "text" | "email" | "tel" | "date"; autoComplete?: string }
> = {
  name: { label: "Nome completo", placeholder: "Como quer ser tratado", input: "text", autoComplete: "name" },
  email: { label: "E-mail", placeholder: "Onde enviamos o acesso", input: "email", autoComplete: "email" },
  whatsapp: { label: "WhatsApp", placeholder: "900 000 000", input: "tel", autoComplete: "tel-national" },
  text: { label: "Pergunta", placeholder: "Escreva aqui", input: "text" },
  phone: { label: "Telefone", placeholder: "900 000 000", input: "tel", autoComplete: "tel" },
  location: { label: "Cidade", placeholder: "Cidade, país", input: "text", autoComplete: "address-level2" },
  company: { label: "Empresa", placeholder: "Nome da empresa", input: "text", autoComplete: "organization" },
  job: { label: "Profissão", placeholder: "O que faz", input: "text", autoComplete: "organization-title" },
  instagram: { label: "Instagram", placeholder: "@utilizador", input: "text" },
  date: { label: "Data", placeholder: "dd/mm/aaaa", input: "date" },
};

/** Os campos que só podem existir uma vez: são os dados do contacto. */
export const BASE_KINDS: readonly EntryFieldKind[] = ["name", "email", "whatsapp"];

export const MAX_FIELDS = 8;

/** Os campos de sempre, a partir das colunas antigas do WhatsApp. */
export function defaultEntryFields(collectPhone = true, requirePhone = false): EntryField[] {
  return [
    { id: "name", kind: "name", label: "Nome completo", required: true },
    { id: "email", kind: "email", label: "E-mail", required: true },
    ...(collectPhone ? [{ id: "whatsapp", kind: "whatsapp" as const, label: "WhatsApp", required: requirePhone }] : []),
  ];
}

/** Os campos gravados; uma lista vazia ou inválida volta aos de sempre. */
export function parseEntryFields(raw: unknown, legacy: { collectPhone: boolean; requirePhone: boolean }): EntryField[] {
  if (!Array.isArray(raw) || raw.length === 0) return defaultEntryFields(legacy.collectPhone, legacy.requirePhone);
  const seen = new Set<string>();
  const out: EntryField[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const r = item as Record<string, unknown>;
    const kind = String(r["kind"]) as EntryFieldKind;
    if (!(kind in FIELD_KINDS)) continue;
    const id = BASE_KINDS.includes(kind) ? kind : String(r["id"] ?? "").slice(0, 40);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = String(r["label"] ?? "").trim().slice(0, 60) || FIELD_KINDS[kind].label;
    const icon = typeof r["icon"] === "string" && (FIELD_ICON_KEYS as readonly string[]).includes(r["icon"]) ? r["icon"] : undefined;
    out.push({ id, kind, label, required: Boolean(r["required"]), ...(icon ? { icon } : {}) });
  }
  return out.length ? out.slice(0, MAX_FIELDS) : defaultEntryFields(legacy.collectPhone, legacy.requirePhone);
}

/** O que impede gravar a lista de campos. */
export function entryFieldsProblem(fields: readonly EntryField[]): string | null {
  const contact = fields.some((f) => f.kind === "email" || f.kind === "whatsapp");
  if (!contact) return "Precisa de pelo menos um contacto: e-mail ou WhatsApp.";
  if (fields.length > MAX_FIELDS) return `No máximo ${MAX_FIELDS} campos.`;
  return null;
}

/** O nome do campo na API pública e no formulário embed: nome, e-mail e WhatsApp («phone») soltos; os outros em «answers». */
export function fieldApiKey(field: Pick<EntryField, "id" | "kind">): string {
  return field.kind === "name" || field.kind === "email" ? field.kind : field.kind === "whatsapp" ? "phone" : field.id;
}

/** Os campos como o formulário embed os desenha na página externa: os mesmos da página do Novawebinar. */
export function embedFields(fields: readonly EntryField[]) {
  return fields.map((field) => ({
    key: fieldApiKey(field),
    /** Fora de «answers»: nome, e-mail ou WhatsApp. */
    base: BASE_KINDS.includes(field.kind),
    phone: field.kind === "whatsapp",
    label: field.label,
    input: field.kind === "whatsapp" ? "tel" : FIELD_KINDS[field.kind].input,
    placeholder: FIELD_KINDS[field.kind].placeholder,
    autoComplete: FIELD_KINDS[field.kind].autoComplete ?? "off",
    required: field.required,
  }));
}

/** O aviso no topo da página: as vagas em % ou um texto curto. Desligado por omissão. */
export type EntryNotice = { kind: "progress"; value: number } | { kind: "text"; text: string };
export const NOTICE_TEXT_MAX = 40;

export function entryNotice(w: {
  registration_progress_enabled: boolean;
  registration_progress_value: number | string;
  registration_badge_text?: string | null | undefined;
}): EntryNotice | null {
  if (w.registration_progress_enabled)
    return { kind: "progress", value: Math.min(100, Math.max(0, Math.round(Number(w.registration_progress_value) || 0))) };
  const text = (w.registration_badge_text ?? "").trim().slice(0, NOTICE_TEXT_MAX);
  return text ? { kind: "text", text } : null;
}

export function newFieldId() {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type EntryResult =
  | {
      ok: true;
      name: string;
      email: string | null;
      /** Só os dígitos e símbolos; o indicativo do país junta-se fora. */
      phone: string | null;
      answers: Record<string, string>;
    }
  | { ok: false; message: string; field: string };

/**
 * Valida o que a pessoa escreveu, campo a campo. Sem campo de nome, o nome vem do e-mail (ou
 * «Participante»), porque a participação precisa sempre de um nome.
 */
export function validateEntry(fields: readonly EntryField[], values: Readonly<Record<string, string>>): EntryResult {
  let name = "";
  let email: string | null = null;
  let phone: string | null = null;
  const answers: Record<string, string> = {};
  for (const field of fields) {
    const value = (values[field.id] ?? "").trim();
    if (!value) {
      if (field.required) return { ok: false, field: field.id, message: `Preencha: ${field.label}.` };
      continue;
    }
    switch (field.kind) {
      case "name":
        if (value.length < 2) return { ok: false, field: field.id, message: "Diga-nos o seu nome." };
        name = value.slice(0, 80);
        break;
      case "email":
        if (!EMAIL.test(value) || value.length > 160)
          return { ok: false, field: field.id, message: "Indique um e-mail válido." };
        email = value.toLowerCase();
        break;
      case "whatsapp": {
        const digits = value.replace(/\D/g, "");
        if (digits.length < 6 || digits.length > 15)
          return { ok: false, field: field.id, message: "Indique um número de WhatsApp válido." };
        // O indicativo do país («+244») fica: o número vai para o WhatsApp tal como está.
        phone = value.replace(/[^\d\s()+-]/g, "").trim().slice(0, 30);
        break;
      }
      default:
        answers[field.id] = value.slice(0, 200);
    }
  }
  if (!email && !phone) {
    const contact = fields.find((f) => f.kind === "email" || f.kind === "whatsapp");
    return { ok: false, field: contact?.id ?? "email", message: "Deixe um contacto: e-mail ou WhatsApp." };
  }
  if (!name) name = email ? email.split("@")[0]!.slice(0, 80) : "Participante";
  if (name.length < 2) name = "Participante";
  return { ok: true, name, email, phone, answers };
}
