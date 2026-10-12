/**
 * Testes A/B: o modelo partilhado pelo servidor e pelos ecrãs. Um teste tem um endereço público próprio
 * (slug) e duas ou mais variantes, cada uma com o seu webinar e uma fatia do tráfego. Quem abre o endereço
 * recebe uma variante e vê a sala desse webinar, sem o endereço mudar.
 */
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { OBJECTIVES, type Objective } from "./stats";

export type AbTestStatus = "draft" | "active" | "paused" | "completed" | "archived";

export const STATUS_LABEL: Record<AbTestStatus, string> = {
  draft: "Rascunho",
  active: "Ativo",
  paused: "Em pausa",
  completed: "Concluído",
  archived: "Arquivado",
};

export const STATUS_TONE: Record<AbTestStatus, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  active: "default",
  paused: "secondary",
  completed: "secondary",
  archived: "outline",
};

/** As letras das variantes, pela ordem: A, B, C… */
export const variantLabel = (index: number) => String.fromCharCode(65 + Math.max(0, Math.min(25, index)));

/** O endereço do teste, como o de um webinar: minúsculas, sem acentos, hífens. */
export function abSlug(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 48) || ""
  );
}

const objectiveIds = OBJECTIVES.map((o) => o.id) as [Objective, ...Objective[]];

export const variantInput = z.object({
  webinarId: z.string().uuid(),
  name: z.string().trim().max(80).default(""),
  trafficPercentage: z.number().int().min(0).max(100),
});

export const createAbTestInput = z
  .object({
    name: z.string().trim().min(2, "Dê um nome ao teste.").max(120),
    slug: z
      .string()
      .trim()
      .min(3, "O endereço precisa de 3 caracteres.")
      .max(48)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Só letras minúsculas, números e hífens."),
    objective: z.enum(objectiveIds).default("conversions"),
    productName: z.string().trim().max(120).default(""),
    minimumVisitors: z.number().int().min(1).max(1_000_000).default(500),
    minimumConversions: z.number().int().min(0).max(1_000_000).default(30),
    minimumDurationDays: z.number().int().min(0).max(365).default(3),
    confidenceThreshold: z.number().min(50).max(99.9).default(95),
    assignmentMode: z.enum(["legacy", "deterministic"]).default("deterministic"),
    variants: z.array(variantInput).min(2, "Um teste precisa de duas variantes.").max(6),
    /** Começa já (ativo) ou fica em rascunho. */
    start: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    const total = value.variants.reduce((sum, v) => sum + v.trafficPercentage, 0);
    if (total !== 100) ctx.addIssue({ code: "custom", path: ["variants"], message: `A divisão do tráfego soma ${total}%; tem de somar 100%.` });
    const ids = new Set(value.variants.map((v) => v.webinarId));
    if (ids.size !== value.variants.length)
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Cada variante tem de ser um webinar diferente." });
  });

export type CreateAbTestInput = z.input<typeof createAbTestInput>;

/** O que se pode mudar num teste já criado: nome, objectivo, critérios e as fatias do tráfego. */
export const updateAbTestInput = z
  .object({
    name: z.string().trim().min(2, "Dê um nome ao teste.").max(120).optional(),
    objective: z.enum(objectiveIds).optional(),
    productName: z.string().trim().max(120).optional(),
    minimumVisitors: z.number().int().min(1).max(1_000_000).optional(),
    minimumConversions: z.number().int().min(0).max(1_000_000).optional(),
    minimumDurationDays: z.number().int().min(0).max(365).optional(),
    confidenceThreshold: z.number().min(50).max(99.9).optional(),
    assignmentMode: z.enum(["legacy", "deterministic"]).optional(),
    autoWinner: z.boolean().optional(),
    /** Optimizar o tráfego sozinho a partir de N dias (ver optimize.ts). */
    autoOptimize: z.boolean().optional(),
    autoOptimizeAfterDays: z.number().int().min(0).max(90).optional(),
    /** As fatias, por id de variante; têm de somar 100. */
    traffic: z.array(z.object({ variantId: z.string().uuid(), trafficPercentage: z.number().int().min(0).max(100) })).min(2).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.traffic) return;
    const total = value.traffic.reduce((sum, v) => sum + v.trafficPercentage, 0);
    if (total !== 100) ctx.addIssue({ code: "custom", path: ["traffic"], message: `A divisão do tráfego soma ${total}%; tem de somar 100%.` });
  });

export type UpdateAbTestInput = z.input<typeof updateAbTestInput>;

export type AbTestVariantRow = {
  id: string;
  ab_test_id: string;
  label: string;
  name: string | null;
  webinar_id: string | null;
  traffic_percentage: number;
  position: number;
  webinar?: { id: string; public_title: string; internal_name: string; slug: string; status: string | null } | null;
};

export type AbTestRow = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  type: string;
  objective: string;
  status: AbTestStatus;
  product_name: string | null;
  applied_variant_id: string | null;
  assignment_mode: string | null;
  auto_winner: boolean | null;
  auto_optimize: boolean | null;
  auto_optimize_after_days: number | null;
  optimized_at: string | null;
  confidence_threshold: number | null;
  minimum_visitors: number | null;
  minimum_conversions: number | null;
  minimum_duration_days: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AbTestHistoryRow = {
  id: string;
  action: string;
  actor_id: string | null;
  details: Json;
  created_at: string;
};

export const HISTORY_LABEL: Record<string, string> = {
  created: "Teste criado",
  started: "Teste iniciado",
  paused: "Teste em pausa",
  resumed: "Teste retomado",
  completed: "Teste concluído",
  archived: "Teste arquivado",
  winner_applied: "Vencedora aplicada",
  duplicated: "Duplicado de outro teste",
  auto_rebalanced: "Tráfego reequilibrado",
  updated: "Definições alteradas",
  traffic_changed: "Divisão do tráfego alterada",
  auto_winner_applied: "Vencedora aplicada automaticamente",
  auto_checked: "Tráfego verificado, sem mudança",
};

export const statusOf = (value: string | null | undefined): AbTestStatus =>
  value === "active" || value === "paused" || value === "completed" || value === "archived" ? value : "draft";
