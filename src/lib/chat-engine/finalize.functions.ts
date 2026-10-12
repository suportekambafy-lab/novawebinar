/** A passagem final do chat gerado, chamada pelo editor antes da revisão. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { assertWebinarAccess, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { finalizeTimelineImpl } from "./finalize.server";

const draftSchema = z.object({
  at: z.number(),
  atMs: z.number().nullable().optional(),
  author: z.string(),
  message: z.string(),
  moment: z.string().optional(),
  kind: z.string().nullable().optional(),
  anchor: z.number().nullable().optional(),
  slot: z.string().nullable().optional(),
  dependency: z.enum(["BEFORE", "AFTER", "INDEPENDENT"]).nullable().optional(),
  reason: z.string().nullable().optional(),
  persona: z.string().optional(),
});

export const finalizeCommentsTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        webinarId: z.string().uuid(),
        comments: z.array(draftSchema).max(20000),
        participants: z.number().int().min(3).max(5000).default(25),
        perMinute: z.number().min(1).max(120).default(10),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertWebinarAccess(context.supabase, data.webinarId);
    return finalizeTimelineImpl(data);
  });
