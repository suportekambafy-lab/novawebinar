/**
 * Coluna central do Atendimento: a conversa, a leitura que o agente fez dela e
 * a resposta de quem atende. Enquanto uma pessoa tem a conversa, o agente não
 * responde. `ConversationPane` só desenha; `ConversationView` liga-a à base.
 */
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRightLeft,
  Bot,
  ChevronDown,
  Link2,
  PhoneCall,
  Send,
  Smile,
  StickyNote,
  UserCheck,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { SourceList } from "@/components/ai-agent/agent-panel";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { discardAgentSuggestion, sendAgentSuggestion } from "@/lib/ai-agent/agent.functions";
import { publicOrigin } from "@/lib/data";
import { friendlyError } from "@/lib/friendly-error";
import {
  useAgentAnalysis,
  useContactContext,
  useConversationMessages,
  useSupportInvalidate,
  type StaffMember,
  type SupportConversation,
} from "@/lib/support/hooks";
import {
  caseOpenedBy,
  categoryLabel,
  intentLabel,
  type CaseRow,
  type DepartmentRow,
} from "@/lib/support/model";
import {
  assumeConversation,
  replyToConversation,
  runCaseAction,
  setConversationAi,
} from "@/lib/support/support.functions";
import { cn } from "@/lib/utils";
import { clockLabel } from "@/lib/webinar-metrics";
import { AiAvatar, hourLabel } from "./badges";
import { CaseActions, TransferMenu, useRunCase } from "./case-tools";
import { channelName, ExampleTag, PersonPhoto } from "./inbox";

/* ---------- Desenho ---------- */

export type PaneMessage = {
  id: string;
  from: "contact" | "ai" | "team";
  author?: string | null | undefined;
  body: string;
  at: string;
  second?: number | null | undefined;
  /** A mensagem leva o link da oferta: mostra-se como cartão com botão. */
  offer?: { title: string; button: string; href: string | null } | null | undefined;
};

/**
 * Um acontecimento no fio que não é uma mensagem: a abertura do caso. Só é uma
 * passagem do agente quando foi o agente a abri-lo (`by: "agent"`).
 */
export type PaneNote = {
  id: string;
  at: string;
  title: string;
  detail?: string | null | undefined;
  by: "agent" | "team" | "rule";
};

export type PaneAnalysis = {
  facts: { label: string; value: string }[];
  suggestion: { text: string; sources?: ReactNode } | null;
};

export type QuickReply = {
  label: string;
  icon?: typeof Link2;
  insert?: string;
  onClick?: () => void;
};

export type SendInput = { mode: "reply" | "note"; body: string; fromSuggestion: boolean };

const EMOJIS = [
  "🙂",
  "😊",
  "😉",
  "🙏",
  "👍",
  "👏",
  "🎉",
  "🔥",
  "✅",
  "💳",
  "📅",
  "📞",
  "❤️",
  "🚀",
  "⏰",
  "💬",
];

const dayLabel = (iso: string) => {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (date.toDateString() === today.toDateString()) return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  return date.toLocaleDateString("pt-PT", { day: "2-digit", month: "long" });
};

export function ConversationPane({
  name,
  photo,
  channel,
  example,
  contactLine,
  status,
  actions,
  control,
  messages,
  notes = [],
  analysis,
  waitingCustomer,
  quick,
  noteEnabled,
  replyHint,
  busy,
  onSend,
  onSendSuggestion,
  onDiscardSuggestion,
  onBack,
  onShowContact,
}: {
  name: string;
  photo?: string | null | undefined;
  channel: string;
  example?: boolean | undefined;
  /** Uma linha por baixo do nome: o webinar e o local. O resto está no contacto. */
  contactLine: string[];
  status: { tone: "ai" | "wait" | "person"; text: string };
  actions: ReactNode;
  /** Na faixa do estado, à direita: o interruptor do agente nesta conversa. */
  control?: ReactNode;
  messages: PaneMessage[];
  notes?: PaneNote[];
  analysis: PaneAnalysis | null;
  waitingCustomer?: boolean | undefined;
  quick: QuickReply[];
  noteEnabled: boolean;
  replyHint: string;
  busy?: boolean | undefined;
  onSend: (input: SendInput) => Promise<boolean>;
  onSendSuggestion?: (() => void) | undefined;
  onDiscardSuggestion?: (() => void) | undefined;
  onBack: () => void;
  onShowContact: () => void;
}) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [text, setText] = useState("");
  const [fromSuggestion, setFromSuggestion] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, name]);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const body = text.trim();
    if (!body) return;
    if (await onSend({ mode, body, fromSuggestion })) {
      setText("");
      setFromSuggestion(false);
    }
  };
  const insert = (value: string) => setText((current) => (current ? `${current} ${value}` : value));

  // Mensagens e passagens no mesmo fio, por hora, com o dia a separar.
  const thread = [
    ...messages.map((m) => ({ kind: "message" as const, at: m.at, m })),
    ...notes.map((n) => ({ kind: "note" as const, at: n.at, n })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b">
        {/* Nome e botões na mesma linha quando cabem; no telemóvel os botões descem. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2.5 p-3 @2xl:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-1 shrink-0 @2xl:hidden"
            onClick={onBack}
            aria-label="Voltar às conversas"
          >
            <ArrowLeft />
          </Button>
          {/* A foto e o nome abrem o contacto, como no WhatsApp. */}
          <button
            type="button"
            onClick={onShowContact}
            title="Ver o contacto"
            className="flex min-w-[10.5rem] flex-1 cursor-pointer items-center gap-3 rounded-lg text-left"
          >
            <PersonPhoto name={name} photo={photo} channel={channel} size={44} />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate text-[16px] font-semibold">{name}</span>
                {/* Com espaço, a faixa do exemplo já está à vista por cima. */}
                {example && (
                  <span className="@2xl:hidden">
                    <ExampleTag />
                  </span>
                )}
              </span>
              {contactLine.length > 0 && (
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {contactLine.join(" · ")}
                </span>
              )}
            </span>
          </button>
          {/* Com rato, botões de 32px para caberem ao lado do nome; no toque ficam com 36px. */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 pointer-fine:@2xl:[&_button]:h-8 pointer-fine:@2xl:[&_button]:px-3 pointer-fine:@2xl:[&_button]:text-[13px]">
            {actions}
          </div>
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5 border-t px-4 py-2 text-[13px]",
            status.tone === "wait" ? "bg-warning-soft" : "bg-gray-50",
          )}
        >
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              status.tone === "ai"
                ? "bg-success"
                : status.tone === "wait"
                  ? "bg-warning"
                  : "bg-info",
            )}
            aria-hidden
          />
          <span className="font-medium">{status.text}</span>
          {control && <span className="ml-auto flex items-center gap-2">{control}</span>}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain bg-gray-50/60 px-3 py-4 md:px-5">
        {thread.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Sem mensagens nesta conversa.</p>
        )}
        {thread.map((entry, index) => {
          const day = dayLabel(entry.at);
          const newDay = index === 0 || dayLabel(thread[index - 1]!.at) !== day;
          return (
            <div key={entry.kind === "message" ? entry.m.id : entry.n.id}>
              {newDay && (
                <p className="my-3 text-center">
                  <span className="rounded-pill bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-300)]">
                    {day}
                  </span>
                </p>
              )}
              {entry.kind === "note" ? (
                <HandoffCard note={entry.n} />
              ) : (
                <Bubble m={entry.m} name={name} photo={photo} />
              )}
            </div>
          );
        })}

        <div ref={endRef} />
      </div>

      {analysis && (
        <AgentBar
          analysis={analysis}
          busy={busy}
          onUse={() => {
            setMode("reply");
            setText(analysis.suggestion!.text);
            setFromSuggestion(true);
          }}
          onSend={onSendSuggestion}
          onDiscard={onDiscardSuggestion}
        />
      )}

      {waitingCustomer && (
        <p className="border-t bg-warning-soft px-4 py-2 text-center text-xs text-foreground">
          À espera do cliente. O caso volta a «Em atendimento» quando ele escrever.
        </p>
      )}

      <form
        onSubmit={submit}
        className="border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <div className="mb-2 flex items-center gap-1">
          <ModeTab active={mode === "reply"} onClick={() => setMode("reply")}>
            Responder
          </ModeTab>
          <ModeTab
            active={mode === "note"}
            onClick={() => setMode("note")}
            disabled={!noteEnabled}
            title={noteEnabled ? undefined : "As notas ficam no caso: assuma a conversa primeiro."}
            note
          >
            <StickyNote className="size-3.5" aria-hidden /> Nota interna
          </ModeTab>
          <span className="ml-auto flex items-center gap-1.5 rounded-pill bg-gray-100 px-2.5 py-1 text-[12px] text-muted-foreground">
            {mode === "note" ? "Só a equipa vê" : `Por ${channelName(channel)}`}
          </span>
        </div>
        {mode === "reply" && quick.length > 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pr-6 [mask-image:linear-gradient(to_right,black_85%,transparent)] [scrollbar-width:none]">
            {quick.map((q) => {
              const Icon = q.icon ?? Link2;
              return (
                <Button
                  key={q.label}
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => (q.insert ? insert(q.insert) : q.onClick?.())}
                >
                  <Icon /> {q.label}
                </Button>
              );
            })}
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mb-1 shrink-0"
                aria-label="Emoji"
                disabled={mode === "note"}
              >
                <Smile />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-2">
              <div className="grid grid-cols-8 gap-1">
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => insert(emoji)}
                    className="flex size-9 items-center justify-center rounded-md text-lg hover:bg-gray-100"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (!e.target.value) setFromSuggestion(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
            rows={1}
            maxLength={2000}
            placeholder={mode === "note" ? "Nota só para a equipa. O cliente não a vê." : replyHint}
            className={cn(
              "min-h-[2.75rem] flex-1 resize-none text-[15px]",
              mode === "note" && "border-warning/40 bg-warning-soft",
            )}
          />
          <Button
            type="submit"
            size="lg"
            disabled={busy || !text.trim()}
            className="mb-0.5 shrink-0 px-4"
          >
            {mode === "note" ? "Guardar" : <Send />}
            <span className={cn(mode === "reply" && "sr-only @2xl:not-sr-only")}>
              {mode === "reply" ? "Enviar" : ""}
            </span>
          </Button>
        </div>
      </form>
    </div>
  );
}

/**
 * A leitura do agente, presa por cima da caixa de escrever: numa linha o que a
 * pessoa quer e a resposta que o agente preparou; ao abrir, os pormenores.
 */
function AgentBar({
  analysis,
  busy,
  onUse,
  onSend,
  onDiscard,
}: {
  analysis: PaneAnalysis;
  busy?: boolean | undefined;
  onUse: () => void;
  onSend?: (() => void) | undefined;
  onDiscard?: (() => void) | undefined;
}) {
  const [open, setOpen] = useState(false);
  const headline = analysis.facts
    .filter((f) => f.label === "Intenção" || f.label === "Confiança")
    .map((f) => f.value)
    .join(" · ");
  return (
    // Aberta, a análise nunca tapa a conversa: fica com menos de metade da coluna e rola.
    <section
      className={cn(
        "shrink-0 border-t bg-info-soft/60 px-3 py-2.5 text-sm @2xl:px-4",
        open && "max-h-[45%] overflow-y-auto overscroll-contain",
      )}
    >
      <div className="flex items-center gap-2">
        <AiAvatar className="size-7 bg-card" />
        <p className="min-w-0 flex-1 truncate">
          <span className="font-semibold">Agente IA</span>
          <span className="text-muted-foreground"> · {headline}</span>
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="shrink-0"
        >
          {open ? "Fechar" : "Ver análise"}
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>
      {open && (
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
          {analysis.facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 max-w-full gap-1.5">
              <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
              <dd className="min-w-0 font-medium">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {analysis.suggestion && (
        <div className={cn("mt-2 flex items-center gap-2", open && "flex-wrap")}>
          <p
            className={cn(
              "min-w-0 flex-1 rounded-md bg-card px-3 py-2 text-[13px]",
              open ? "basis-full whitespace-pre-line" : "truncate",
            )}
          >
            {analysis.suggestion.text}
          </p>
          {open && analysis.suggestion.sources}
          <Button size="sm" disabled={busy} onClick={onUse} className="shrink-0">
            Usar resposta
          </Button>
          {open && onSend && (
            <Button size="sm" variant="outline" disabled={busy} onClick={onSend}>
              <Send /> Enviar já
            </Button>
          )}
          {open && onDiscard && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onDiscard}>
              Descartar
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function ModeTab({
  active,
  note,
  children,
  ...props
}: { active: boolean; note?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-sm px-3 text-[13px] font-medium disabled:opacity-40",
        active
          ? note
            ? "bg-warning-soft text-warning"
            : "bg-gray-150 text-foreground"
          : "text-muted-foreground hover:bg-gray-100",
      )}
    >
      {children}
    </button>
  );
}

function Bubble({
  m,
  name,
  photo,
}: {
  m: PaneMessage;
  name: string;
  photo?: string | null | undefined;
}) {
  const mine = m.from !== "contact";
  return (
    <div className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
      {!mine && <PersonPhoto name={name} photo={photo} size={28} />}
      <div className={cn("max-w-[82%] md:max-w-[75%]", mine && "items-end")}>
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed",
            m.from === "team"
              ? "rounded-br-md bg-foreground text-background"
              : m.from === "ai"
                ? "rounded-br-md bg-info-soft text-foreground"
                : "rounded-bl-md bg-card text-foreground shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-300)]",
          )}
        >
          {m.from === "ai" && (
            <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-info">
              <Bot className="size-3.5" aria-hidden /> Agente IA
            </span>
          )}
          {m.from === "team" && m.author && (
            <span className="mb-1 block text-xs font-semibold opacity-80">{m.author}</span>
          )}
          <span className="whitespace-pre-line break-words">{m.body}</span>
          {m.offer && (
            <span className="mt-2.5 block overflow-hidden rounded-lg bg-card text-foreground shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-300)]">
              <span className="block px-3 pt-2.5 text-xs text-muted-foreground">Oferta</span>
              <span className="block px-3 pb-2 text-sm font-semibold">{m.offer.title}</span>
              <a
                href={m.offer.href ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-10 items-center justify-center bg-success text-[13px] font-semibold text-white"
              >
                {m.offer.button}
              </a>
            </span>
          )}
        </div>
        <span
          className={cn("mt-1 block px-1 text-xs text-muted-foreground", mine && "text-right")}
        >
          {hourLabel(m.at)}
          {m.from === "contact" && m.second != null ? ` · no minuto ${clockLabel(m.second)}` : ""}
        </span>
      </div>
    </div>
  );
}

const NOTE_ICON = { agent: Bot, team: UserCheck, rule: ArrowRightLeft };

function HandoffCard({ note }: { note: PaneNote }) {
  const Icon = NOTE_ICON[note.by];
  return (
    <div
      className={cn(
        "mx-auto my-2 max-w-md rounded-xl border px-3.5 py-2.5 text-[13px]",
        note.by === "team" ? "bg-card" : "border-warning/30 bg-warning-soft",
      )}
    >
      <p className="flex items-center gap-1.5 font-semibold">
        <Icon className="size-4" aria-hidden /> {note.title}
      </p>
      {note.detail && <p className="mt-0.5 text-muted-foreground">{note.detail}</p>}
      <p className="mt-1 text-xs text-muted-foreground">{hourLabel(note.at)}</p>
    </div>
  );
}

/* ---------- Ligação à base ---------- */

const CLASSIFICATION: Record<string, string> = {
  QUESTION: "Pergunta",
  OBJECTION: "Objecção",
  PURCHASE_INTENT: "Intenção de compra",
  SUPPORT: "Pedido de ajuda",
  COMMENT: "Comentário",
  PRAISE: "Elogio",
  SMALL_TALK: "Conversa",
  HUMAN_REQUEST: "Pediu uma pessoa",
  UNKNOWN: "Por classificar",
};

const DECISION: Record<string, string> = {
  RESPOND: "Responder",
  IGNORE: "Não precisa de resposta",
  SUGGEST_TO_TEAM: "Sugerir à equipa",
  ESCALATE: "Passar à equipa",
};

type Webinar = {
  id: string;
  slug: string;
  public_title: string;
  cta_url: string | null;
  cta_text?: string | null;
};

export function ConversationView({
  conversation,
  currentCase,
  webinar,
  staff,
  departments,
  myStaffId,
  onBack,
  onShowContact,
}: {
  conversation: SupportConversation;
  currentCase: CaseRow | null;
  webinar: Webinar | undefined;
  staff: StaffMember[];
  departments: DepartmentRow[];
  myStaffId: string | null;
  onBack: () => void;
  onShowContact: () => void;
}) {
  const { data: rows = [] } = useConversationMessages(conversation.id);
  const { data: analysis } = useAgentAnalysis(conversation.id);
  const participant = conversation.participants;
  // A mesma leitura do painel do contacto: fica em cache, não se repete.
  const { data: detail } = useContactContext(
    participant?.contact_id ?? null,
    conversation.participant_id,
  );
  const invalidate = useSupportInvalidate();
  const assume = useServerFn(assumeConversation);
  const reply = useServerFn(replyToConversation);
  const toggleAi = useServerFn(setConversationAi);
  const caseAction = useServerFn(runCaseAction);
  const approve = useServerFn(sendAgentSuggestion);
  const discard = useServerFn(discardAgentSuggestion);
  const { run: runCase } = useRunCase();
  const [busy, setBusy] = useState(false);

  const name = participant?.name ?? "Participante";
  const owner = staff.find((s) => s.id === currentCase?.assigned_staff_id);
  const team = departments.find((d) => d.id === currentCase?.department_id);
  const suggestion =
    analysis && analysis.status === "suggested" && analysis.answer ? analysis : null;
  const refresh = () =>
    invalidate("messages", "conversations", "cases", "events", "analysis", "staff");

  const guard = async (work: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await work();
      if (done) toast.success(done);
      refresh();
      return true;
    } catch (error) {
      toast.error(friendlyError(error, "Não foi possível concluir."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const offerUrl = webinar?.cta_url?.trim() || null;
  const messages: PaneMessage[] = rows.map((m) => ({
    id: m.id,
    from:
      m.sender_kind === "participant" ? "contact" : m.sender_kind === "ai_agent" ? "ai" : "team",
    author:
      m.sender_kind === "team"
        ? (staff.find((s) => s.user_id === m.sender_user_id)?.name ?? "Equipa")
        : null,
    body: m.body,
    at: m.created_at,
    second: m.video_second,
    offer:
      offerUrl && m.sender_kind !== "participant" && m.body.includes(offerUrl)
        ? {
            title: webinar!.public_title,
            button: webinar?.cta_text?.trim() || "Ver a oferta",
            href: offerUrl,
          }
        : null,
  }));

  // A abertura do caso no fio: a passagem do agente (com o motivo e a sugestão),
  // a de uma regra, ou uma pessoa que assumiu. Só a do agente leva o ícone dele.
  const openedBy = currentCase ? caseOpenedBy(currentCase) : null;
  const notes: PaneNote[] =
    currentCase && openedBy
      ? [
          {
            id: `case-${currentCase.id}`,
            at: currentCase.created_at,
            by: openedBy,
            title:
              openedBy === "team"
                ? "Assumido pela equipa"
                : `Passado a ${team?.name ?? "equipa"}${openedBy === "agent" ? " pelo agente" : ""}`,
            detail:
              openedBy === "team"
                ? null
                : [
                    currentCase.reason_for_escalation,
                    currentCase.recommended_action &&
                      `Sugestão: ${currentCase.recommended_action}`,
                  ]
                    .filter(Boolean)
                    .join(". "),
          },
        ]
      : [];

  const facts = analysis
    ? [
        {
          label: "Intenção",
          value: currentCase
            ? intentLabel(currentCase.intent)
            : (CLASSIFICATION[analysis.classification] ?? analysis.classification),
        },
        ...(currentCase
          ? [{ label: "Categoria", value: categoryLabel(currentCase.category) }]
          : []),
        { label: "Confiança", value: `${Math.round(analysis.confidence * 100)}%` },
        { label: "Decisão", value: DECISION[analysis.decision] ?? analysis.decision },
        {
          label: "Precisa de uma pessoa",
          value: analysis.decision === "ESCALATE" ? (analysis.escalationReason ?? "Sim") : "Não",
        },
        ...(currentCase?.recommended_action
          ? [{ label: "Acção sugerida", value: currentCase.recommended_action }]
          : []),
      ]
    : [];

  const roomLink = webinar ? `${publicOrigin()}/w/${webinar.slug}` : null;

  // Sem caso, transferir é assumir e passar: o caso nasce com quem o passou.
  const viaCase = async (then: (caseId: string) => Promise<unknown>, done: string) =>
    guard(async () => {
      const opened = currentCase
        ? { caseId: currentCase.id }
        : await assume({ data: { conversationId: conversation.id } });
      await then(opened.caseId);
    }, done);

  const actions = currentCase ? (
    <CaseActions
      c={currentCase}
      myStaffId={myStaffId}
      staff={staff}
      departments={departments}
      size="default"
    />
  ) : (
    <>
      <Button
        disabled={busy}
        onClick={() =>
          void guard(
            () => assume({ data: { conversationId: conversation.id } }),
            "A conversa é sua. O agente não responde enquanto estiver a atender.",
          )
        }
      >
        <UserCheck /> Assumir
      </Button>
      <TransferMenu
        c={{ assigned_staff_id: null }}
        staff={staff}
        departments={departments}
        disabled={busy}
        size="default"
        onTransfer={(target) =>
          void viaCase(
            (caseId) => caseAction({ data: { action: "transfer", caseId, ...target } }),
            "Conversa transferida.",
          )
        }
        onEscalate={() =>
          void viaCase(
            (caseId) => caseAction({ data: { action: "escalate", caseId } }),
            "Passada ao supervisor.",
          )
        }
      />
    </>
  );

  // O interruptor do agente nesta conversa: ligado, responde; desligado, tudo vai para a equipa.
  // Com um caso aberto está desligado; ligá-lo devolve a conversa ao agente.
  const aiOn = !currentCase && !conversation.ai_paused && !conversation.needs_human;
  const control = (
    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
      <span className="text-muted-foreground">Agente IA nesta conversa</span>
      <Switch
        checked={aiOn}
        disabled={busy}
        aria-label="Agente IA nesta conversa"
        onCheckedChange={(enabled) =>
          void guard(
            () => toggleAi({ data: { conversationId: conversation.id, enabled } }),
            enabled ? "O agente volta a responder." : "Agente em pausa nesta conversa.",
          )
        }
      />
    </label>
  );

  // Só o texto; o caso, o estado, a prioridade e o prazo estão no contacto (foto ou nome).
  const status = currentCase
    ? {
        tone: owner ? ("person" as const) : ("wait" as const),
        text: owner
          ? `Com ${owner.name}`
          : `À espera de uma pessoa${team ? ` · ${team.name}` : ""}`,
      }
    : conversation.ai_paused || conversation.needs_human
      ? {
          tone: "wait" as const,
          text: "Agente em pausa: a próxima mensagem abre um caso para a equipa.",
        }
      : { tone: "ai" as const, text: "O agente está a responder. Assuma para falar você." };

  return (
    <ConversationPane
      key={conversation.id}
      name={name}
      channel={conversation.channel}
      contactLine={[conversation.webinars?.public_title ?? "", detail?.place ?? ""].filter(
        Boolean,
      )}
      status={status}
      actions={actions}
      control={control}
      messages={messages}
      notes={notes}
      analysis={
        analysis
          ? {
              facts,
              suggestion: suggestion
                ? { text: suggestion.answer, sources: <SourceList sources={suggestion.sources} /> }
                : null,
            }
          : null
      }
      waitingCustomer={currentCase?.status === "waiting_customer"}
      quick={[
        ...(offerUrl ? [{ label: "Link da oferta", insert: offerUrl }] : []),
        ...(roomLink ? [{ label: "Link da sala", insert: roomLink }] : []),
        ...(currentCase && !currentCase.call_required
          ? [
              {
                label: "Marcar ligação",
                icon: PhoneCall,
                onClick: () => void runCase({ action: "request_call", caseId: currentCase.id }),
              },
            ]
          : []),
      ]}
      noteEnabled={Boolean(currentCase)}
      replyHint={
        currentCase ? "Escreva a resposta para o cliente" : "Responder (a conversa passa a ser sua)"
      }
      busy={busy}
      onSend={async ({ mode, body, fromSuggestion }) => {
        if (mode === "note")
          return currentCase ? runCase({ action: "note", caseId: currentCase.id, body }) : false;
        return guard(() =>
          reply({
            data: {
              conversationId: conversation.id,
              body,
              ...(fromSuggestion && suggestion ? { suggestionId: suggestion.id } : {}),
            },
          }),
        );
      }}
      onSendSuggestion={
        suggestion
          ? () =>
              void guard(() =>
                currentCase
                  ? reply({
                      data: {
                        conversationId: conversation.id,
                        body: suggestion.answer,
                        suggestionId: suggestion.id,
                      },
                    })
                  : approve({ data: { id: suggestion.id, finalAnswer: suggestion.answer } }),
              )
          : undefined
      }
      onDiscardSuggestion={
        suggestion ? () => void guard(() => discard({ data: { id: suggestion.id } })) : undefined
      }
      onBack={onBack}
      onShowContact={onShowContact}
    />
  );
}
