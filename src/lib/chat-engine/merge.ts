/**
 * Regenerar sem destruir o que foi feito à mão.
 *
 * Ficam os comentários escritos à mão e os que foram editados à mão. O resto
 * é substituído. Dos novos, não entram os que ocupam a mesma oportunidade de
 * um comentário que ficou, nem os que repetem a mensagem ou colam no mesmo
 * instante com o mesmo nome.
 */

export type StoredComment = {
  id: string;
  at: number;
  author: string;
  message: string;
  type: string | null;
  slotId: string | null;
  edited: boolean;
};

export type GeneratedLike = { at: number; author: string; message: string; slotId?: string | null };

export function normalizeMessage(text: string) {
  return text
    .toLocaleLowerCase("pt")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function isPreserved(comment: Pick<StoredComment, "type" | "edited">) {
  return comment.type === "manual" || comment.edited;
}

export function planRegeneration<T extends GeneratedLike>(
  existing: readonly StoredComment[],
  generated: readonly T[],
): { keep: StoredComment[]; deleteIds: string[]; inserts: T[]; skipped: number } {
  const keep = existing.filter(isPreserved);
  const deleteIds = existing.filter((c) => !isPreserved(c)).map((c) => c.id);
  const slotsTaken = new Set(keep.map((c) => c.slotId).filter((s): s is string => Boolean(s)));
  const messages = new Set(keep.map((c) => normalizeMessage(c.message)).filter(Boolean));
  const inserts: T[] = [];
  let skipped = 0;
  for (const draft of generated) {
    const slotTaken = draft.slotId ? slotsTaken.has(draft.slotId) : false;
    const sameSpot = keep.some((c) => c.author === draft.author && Math.abs(c.at - draft.at) <= 3);
    const sameText = messages.has(normalizeMessage(draft.message));
    if (slotTaken || sameSpot || sameText) {
      skipped += 1;
      continue;
    }
    inserts.push(draft);
  }
  return { keep, deleteIds, inserts, skipped };
}
