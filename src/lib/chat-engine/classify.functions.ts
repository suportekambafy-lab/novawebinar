/** Classificar a fala do webinar em blocos, uma vez, antes de gerar o chat. */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { assertWebinarWriter as assertWebinarAccess, requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { runBilled } from "@/lib/ai/billing.server";
import { latestReadyVersion } from "@/lib/temporal/engine.server";

import { ensureVersionBlocks } from "./classify.server";
import type { BlockType } from "./types";

export type BlockClassificationSummary = {
  versionId: string | null;
  total: number;
  refined: number;
  fresh: boolean;
  byType: Partial<Record<BlockType, number>>;
};

export const classifyTranscriptBlocks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ webinarId: z.string().uuid(), force: z.boolean().optional() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<BlockClassificationSummary> => {
    const organizationId = await assertWebinarAccess(context.supabase, data.webinarId);
    const version = await latestReadyVersion(data.webinarId);
    if (!version || version.sentences.length === 0)
      return { versionId: null, total: 0, refined: 0, fresh: false, byType: {} };
    const { data: webinar } = await context.supabase
      .from("webinars")
      .select("host_name")
      .eq("id", data.webinarId)
      .maybeSingle();
    const hostName = typeof webinar?.host_name === "string" ? webinar.host_name : null;
    const result = await runBilled({ organizationId, action: "webinar_analysis" }, () =>
      ensureVersionBlocks(version, { ai: true, hostName, ...(data.force ? { force: true } : {}) }),
    );
    const byType: Partial<Record<BlockType, number>> = {};
    for (const block of result.blocks) byType[block.type] = (byType[block.type] ?? 0) + 1;
    return {
      versionId: version.id,
      total: result.blocks.length,
      refined: result.refined,
      fresh: result.fresh,
      byType,
    };
  });
