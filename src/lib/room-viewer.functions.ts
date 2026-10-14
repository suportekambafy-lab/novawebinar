import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Quem regressa à sala: a sessão desta pessoa, até onde viu e se comprou (a sala decide em room-return). */
export const getViewerState = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ token: z.string().min(10).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const { participantFromToken } = await import("@/lib/public-room.server");
    const { VIEWER_EXPIRED } = await import("@/lib/public-room.functions");
    const participantId = participantFromToken(data.token);
    if (!participantId) throw new Error(VIEWER_EXPIRED);
    const { loadViewerState, moveToNextSession } = await import("@/lib/room-viewer.server");
    const state = await loadViewerState(participantId);
    if (!state) throw new Error(VIEWER_EXPIRED);
    // Num webinar que repete, a sessão acabada dá lugar à seguinte (ver room-return).
    return (await moveToNextSession(participantId, state)) ?? state;
  });
