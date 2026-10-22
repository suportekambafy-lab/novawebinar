/**
 * Webinar Intelligence: um endereço único que decide o webinar pela pessoa. O organizador escolhe o
 * favorito (para quem chega de novo) e o secundário (para quem já viu um webinar da organização).
 * Fora dos testes A/B: tabela, página e resolvedor próprios.
 */
import { z } from "zod";

export { abSlug as smartSlug } from "@/lib/ab-tests/model";

export const SMART_LINK_STATUSES = ["active", "paused"] as const;
export type SmartLinkStatus = (typeof SMART_LINK_STATUSES)[number];

export const smartLinkInput = z.object({
  name: z.string().trim().min(2, "Dê um nome ao link.").max(120),
  slug: z
    .string()
    .trim()
    .min(3, "O endereço precisa de 3 caracteres.")
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Só letras minúsculas, números e hífens."),
  primaryWebinarId: z.string().uuid("Escolha o webinar favorito."),
  secondaryWebinarId: z.string().uuid().nullable().default(null),
});
export type SmartLinkInput = z.infer<typeof smartLinkInput>;

export type SmartLinkRow = {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  primary_webinar_id: string;
  secondary_webinar_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type SmartLinkWebinar = { id: string; public_title: string; internal_name: string; slug: string; status: string };

export type SmartLinkSummary = {
  link: SmartLinkRow;
  primary: SmartLinkWebinar | null;
  secondary: SmartLinkWebinar | null;
  /** Visitas desde sempre e nos últimos 7 dias, novas e de quem já tinha visto. */
  visits: { total: number; returning: number; week: number; weekReturning: number };
};

/** Como se decide o webinar: a regra, sem base de dados, para os testes e para a página explicar. */
export function decideWebinar(
  link: Pick<SmartLinkRow, "primary_webinar_id" | "secondary_webinar_id" | "status">,
  returning: boolean,
): string {
  if (link.status !== "active" || !link.secondary_webinar_id) return link.primary_webinar_id;
  return returning ? link.secondary_webinar_id : link.primary_webinar_id;
}
