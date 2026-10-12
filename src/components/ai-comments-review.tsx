/**
 * Revisão do chat gerado, bloco a bloco: a fala do apresentador, o que o
 * motor percebeu dela (tipo, interacção esperada, confiança) e, por baixo,
 * as mensagens com a sua dependência (antes de ser lido, depois da fala,
 * livre), o desvio em segundos face ao bloco e o que a validação fez.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { blockAt } from "@/lib/chat-engine/blocks";
import {
  BLOCK_COLOR,
  BLOCK_LABEL,
  DEPENDENCY_COLOR,
  DEPENDENCY_LABEL,
  INTERACTION_LABEL,
} from "@/lib/chat-engine/labels";
import type { Dependency, SemanticBlock } from "@/lib/chat-engine/types";
import type { AiJob, DraftComment } from "@/lib/ai-comment-jobs";
import { cn } from "@/lib/utils";

const RULE_LABEL: Record<string, string> = {
  "resposta-antes-da-pergunta": "estava antes da pergunta",
  "mensagem-depois-de-lida": "estava depois de ser lida",
  "fora-da-janela": "estava fora da janela",
  "nome-lido": "nome corrigido pelo que o apresentador diz",
  "resposta-sem-mensagem": "respondia a quem não tinha escrito",
  "pretexto-sem-leitura": "passou a livre",
  "mesmo-instante": "afastada de outra no mesmo instante",
};

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function toSeconds(value: string) {
  const parts = value.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return null;
  if (parts.length === 1) return parts[0]!;
  return parts[0]! * 60 + (parts[1] ?? 0);
}

function offsetLabel(draft: DraftComment, block: SemanticBlock | null) {
  if (!block) return "";
  const atMs = draft.atMs ?? draft.at * 1000;
  const ref = draft.dependency === "BEFORE" ? block.startMs : block.endMs;
  const delta = (atMs - ref) / 1000;
  const sign = delta >= 0 ? "+" : "−";
  return `${sign}${Math.abs(delta).toFixed(1)} s`;
}

type Group = {
  key: string;
  block: SemanticBlock | null;
  items: { draft: DraftComment; index: number }[];
};

export function AiCommentsReview({
  drafts,
  blocks,
  validation,
  busy,
  durationSeconds,
  onChange,
  onRegenerate,
  onSeek,
}: {
  drafts: DraftComment[];
  blocks: SemanticBlock[];
  validation: AiJob["validation"] | undefined;
  busy: boolean;
  durationSeconds: number;
  onChange: (drafts: DraftComment[]) => void;
  onRegenerate: (index: number) => void;
  onSeek?: ((seconds: number) => void) | undefined;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const byId = useMemo(() => new Map(blocks.map((b) => [b.id, b] as const)), [blocks]);

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    drafts.forEach((draft, index) => {
      const atMs = draft.atMs ?? draft.at * 1000;
      const block = (draft.blockId ? byId.get(draft.blockId) : null) ?? blockAt(blocks, atMs);
      const key = block?.id ?? "livre";
      const group = map.get(key) ?? { key, block: block ?? null, items: [] };
      group.items.push({ draft, index });
      map.set(key, group);
    });
    return [...map.values()].sort(
      (a, b) =>
        (a.block?.startMs ?? Number.MAX_SAFE_INTEGER) -
        (b.block?.startMs ?? Number.MAX_SAFE_INTEGER),
    );
  }, [drafts, blocks, byId]);

  const update = (index: number, patch: Partial<DraftComment>) =>
    onChange(drafts.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const total = Math.max(
    durationSeconds,
    blocks[blocks.length - 1]?.endMs ? blocks[blocks.length - 1]!.endMs / 1000 : 0,
    ...drafts.map((d) => d.at),
  );

  return (
    <div className="space-y-3">
      {validation ? (
        <p className="text-xs text-muted-foreground">
          {validation.kept} mensagens em {validation.slots} oportunidades de {validation.blocks}{" "}
          blocos de fala. Validação: {validation.moved} movidas, {validation.corrected} corrigidas,{" "}
          {validation.removed} eliminadas
          {Object.keys(validation.byRule).length
            ? ` (${Object.entries(validation.byRule)
                .map(([rule, n]) => `${RULE_LABEL[rule] ?? rule}: ${n}`)
                .join("; ")})`
            : ""}
          .
        </p>
      ) : null}

      {blocks.length > 0 && total > 0 ? (
        <div className="rounded-xl border bg-white p-2">
          <svg
            viewBox={`0 0 1000 34`}
            className="h-9 w-full"
            role="img"
            aria-label="Linha do tempo: blocos de fala e mensagens"
          >
            {blocks.map((block) => (
              <rect
                key={block.id}
                x={(block.startMs / 1000 / total) * 1000}
                y={6}
                width={Math.max(1.5, ((block.endMs - block.startMs) / 1000 / total) * 1000)}
                height={14}
                fill={BLOCK_COLOR[block.type]}
                stroke={block.type === "SILENCE" ? "#e4e4e7" : "none"}
                className="cursor-pointer"
                onClick={() => {
                  setOpenKey(block.id);
                  onSeek?.(block.startMs / 1000);
                }}
              >
                <title>
                  {clock(block.startMs / 1000)} · {BLOCK_LABEL[block.type]} ·{" "}
                  {Math.round(block.confidence * 100)}%
                </title>
              </rect>
            ))}
            {drafts.map((draft, index) => (
              <line
                key={index}
                x1={(draft.at / total) * 1000}
                x2={(draft.at / total) * 1000}
                y1={22}
                y2={32}
                stroke={DEPENDENCY_COLOR[(draft.dependency ?? "INDEPENDENT") as Dependency]}
                strokeWidth={1.2}
              />
            ))}
          </svg>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {(
              [
                "QUESTION_TO_AUDIENCE",
                "CHAT_READING",
                "SOCIAL_PROOF",
                "EMOTIONAL_MOMENT",
                "OFFER",
                "CTA",
                "CONTENT",
              ] as const
            ).map((type) => (
              <span key={type} className="inline-flex items-center gap-1">
                <i
                  className="inline-block size-2.5 rounded-sm"
                  style={{ background: BLOCK_COLOR[type] }}
                />
                {BLOCK_LABEL[type]}
              </span>
            ))}
            {(["BEFORE", "AFTER", "INDEPENDENT"] as const).map((dependency) => (
              <span key={dependency} className="inline-flex items-center gap-1">
                <i
                  className="inline-block h-2.5 w-0.5"
                  style={{ background: DEPENDENCY_COLOR[dependency] }}
                />
                {DEPENDENCY_LABEL[dependency]}
              </span>
            ))}
          </p>
        </div>
      ) : null}

      <div className="max-h-[45dvh] space-y-2 overflow-y-auto pr-1">
        {groups.map((group) => {
          const block = group.block;
          const open = openKey === null || openKey === group.key;
          return (
            <section key={group.key} className="rounded-xl border">
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left"
                onClick={() => {
                  setOpenKey((current) => (current === group.key ? null : group.key));
                  if (block) onSeek?.(block.startMs / 1000);
                }}
              >
                {block ? (
                  <>
                    <span className="font-mono text-xs text-muted-foreground">
                      {clock(block.startMs / 1000)}–{clock(block.endMs / 1000)}
                    </span>
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{ background: `${BLOCK_COLOR[block.type]}55` }}
                    >
                      {BLOCK_LABEL[block.type]}
                    </span>
                    {block.expectsResponse ? (
                      <span className="text-xs text-muted-foreground">
                        espera {INTERACTION_LABEL[block.interaction]}
                      </span>
                    ) : block.readsChat ? (
                      <span className="text-xs text-muted-foreground">
                        lê{" "}
                        {block.referenced
                          .map((r) => r.name ?? r.place ?? r.text)
                          .filter(Boolean)
                          .join(", ") || "o chat"}
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        "text-xs",
                        block.confidence < 0.55 ? "text-amber-700" : "text-muted-foreground",
                      )}
                    >
                      {Math.round(block.confidence * 100)}% de certeza
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-medium">Mensagens sem bloco de fala</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{group.items.length}</span>
              </button>
              {block && block.text ? (
                <p className={cn("px-3 pb-2 text-xs text-foreground/80", !open && "line-clamp-1")}>
                  “{block.text}”
                </p>
              ) : null}
              {open
                ? group.items.map(({ draft, index }) => {
                    const dependency = (draft.dependency ?? "INDEPENDENT") as Dependency;
                    return (
                      <div
                        key={index}
                        className={cn(
                          "flex flex-wrap items-start gap-2 border-t px-2 py-2",
                          draft.needsReview && "bg-amber-50/60",
                        )}
                      >
                        <div className="flex items-center gap-1">
                          <Input
                            className="w-20 shrink-0 text-center tabular-nums"
                            value={clock(draft.at)}
                            onChange={(e) => {
                              const seconds = toSeconds(e.target.value);
                              if (seconds === null) return;
                              update(index, { at: seconds, atMs: seconds * 1000 });
                            }}
                          />
                          <span
                            className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10.5px] font-medium text-white"
                            style={{ background: DEPENDENCY_COLOR[dependency] }}
                            title={DEPENDENCY_LABEL[dependency]}
                          >
                            {dependency === "BEFORE"
                              ? "antes"
                              : dependency === "AFTER"
                                ? "depois"
                                : "livre"}
                            {block && dependency !== "INDEPENDENT"
                              ? ` ${offsetLabel(draft, block)}`
                              : ""}
                          </span>
                        </div>
                        <Input
                          className="w-32 shrink-0"
                          value={draft.author}
                          onChange={(e) => update(index, { author: e.target.value })}
                        />
                        <Input
                          className="min-w-[180px] flex-1"
                          value={draft.message}
                          onChange={(e) => update(index, { message: e.target.value })}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Regenerar"
                          disabled={busy}
                          onClick={() => onRegenerate(index)}
                        >
                          <RefreshCw className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remover"
                          onClick={() => onChange(drafts.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                        {draft.validationRule || draft.needsReview ? (
                          <p className="flex w-full items-center gap-1 pl-1 text-[11px] text-amber-700">
                            <AlertTriangle className="size-3" />
                            {draft.validationRule
                              ? (RULE_LABEL[draft.validationRule] ?? draft.validationRule)
                              : "bloco incerto: confirme se faz sentido"}
                            {draft.reason ? (
                              <span className="text-muted-foreground"> · {draft.reason}</span>
                            ) : null}
                          </p>
                        ) : draft.reason ? (
                          <p className="w-full pl-1 text-[11px] text-muted-foreground">
                            {draft.reason}
                          </p>
                        ) : null}
                      </div>
                    );
                  })
                : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
