import type { List, Prisma } from '@prisma/client';
import { conflict } from '../errors.js';
import type { Tx } from './activity.js';

/**
 * List rules: WIP limit and "on enter" automations. A card "enters" a list when it is created in
 * it, moved into it from another list, claimed into it or restored while in it.
 */

/**
 * Row-locks the list until the transaction ends. Every operation that adds a card to a list takes
 * this lock first, so concurrent entries are serialized and the WIP count below can't race.
 */
export async function lockList(tx: Tx, listId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "List" WHERE id = ${listId}::uuid FOR UPDATE`;
}

export async function assertWipCapacity(tx: Tx, list: List): Promise<void> {
  if (list.wipLimit === null) return;
  const count = await tx.card.count({ where: { listId: list.id, archivedAt: null } });
  if (count >= list.wipLimit) {
    throw conflict(
      `List "${list.title}" is at its WIP limit (${count}/${list.wipLimit}). Finish or move a card out of it first.`,
      'WIP_LIMIT_REACHED',
    );
  }
}

export type AppliedAutomations = { assigneeId?: string; labelId?: string; markedDone?: true };

/** Card update data for the list's on-enter automations, plus a summary for the activity log. */
export function onEnterAutomations(list: List): {
  data: Prisma.CardUncheckedUpdateInput;
  applied: AppliedAutomations | null;
} {
  const data: Prisma.CardUncheckedUpdateInput = {};
  const applied: AppliedAutomations = {};
  if (list.onEnterAssigneeId) {
    data.assigneeId = list.onEnterAssigneeId;
    applied.assigneeId = list.onEnterAssigneeId;
  }
  if (list.onEnterLabelId) {
    data.labels = { connect: { id: list.onEnterLabelId } };
    applied.labelId = list.onEnterLabelId;
  }
  if (list.onEnterMarkDone) {
    data.completedAt = new Date();
    applied.markedDone = true;
  }
  return { data, applied: Object.keys(applied).length ? applied : null };
}

/** Locks the target list, enforces its WIP limit and returns its automations. */
export async function enterList(tx: Tx, list: List) {
  await lockList(tx, list.id);
  // Re-read under the lock in case the rules changed meanwhile.
  const locked = await tx.list.findUniqueOrThrow({ where: { id: list.id } });
  await assertWipCapacity(tx, locked);
  return onEnterAutomations(locked);
}
