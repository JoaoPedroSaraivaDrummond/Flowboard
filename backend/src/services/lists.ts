import { badRequest, notFound } from '../errors.js';
import { prisma } from '../lib/prisma.js';
import type { MoveTarget } from '../schemas/common.js';
import { recordActivity, type Tx } from './activity.js';
import { findBoardOrThrow } from './boards.js';
import { byPosition, placeAmongSiblings } from './ordering.js';

export async function findListOrThrow(db: Tx, listId: string) {
  const list = await db.list.findUnique({ where: { id: listId } });
  if (!list) throw notFound('List');
  return list;
}

function activeSiblings(tx: Tx, boardId: string, excludeId?: string) {
  return tx.list.findMany({
    where: { boardId, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: byPosition,
    select: { id: true, position: true },
  });
}

const updateListPosition = (tx: Tx) => (id: string, position: number) =>
  tx.list.update({ where: { id }, data: { position } });

export async function getList(listId: string) {
  return findListOrThrow(prisma, listId);
}

export function createList(actorId: string, boardId: string, data: { title: string } & MoveTarget) {
  return prisma.$transaction(async (tx) => {
    await findBoardOrThrow(tx, boardId);
    const { title, ...target } = data;
    const siblings = await activeSiblings(tx, boardId);
    const { position } = await placeAmongSiblings(siblings, target, updateListPosition(tx));
    const list = await tx.list.create({ data: { boardId, title, position } });
    await recordActivity(tx, {
      boardId,
      actorId,
      type: 'list.created',
      payload: { listId: list.id, title },
    });
    return list;
  });
}

export type UpdateListInput = {
  title?: string;
  wipLimit?: number | null;
  onEnterMarkDone?: boolean;
  onEnterAssigneeId?: string | null;
  onEnterLabelId?: string | null;
};

/** Renames a list and/or changes its rules (WIP limit and on-enter automations). */
export function updateList(actorId: string, listId: string, input: UpdateListInput) {
  return prisma.$transaction(async (tx) => {
    const previous = await findListOrThrow(tx, listId);
    if (input.onEnterLabelId) {
      const label = await tx.label.findUnique({ where: { id: input.onEnterLabelId } });
      if (label?.boardId !== previous.boardId) {
        throw badRequest('onEnterLabelId must be a label of the same board', 'INVALID_LABEL');
      }
    }
    if (input.onEnterAssigneeId) {
      const user = await tx.user.findUnique({ where: { id: input.onEnterAssigneeId } });
      if (!user) throw badRequest('onEnterAssigneeId must be an existing user', 'INVALID_ASSIGNEE');
    }
    const list = await tx.list.update({ where: { id: listId }, data: input });
    await recordActivity(tx, {
      boardId: list.boardId,
      actorId,
      type: 'list.updated',
      payload: {
        listId,
        changes: input,
        ...(input.title ? { from: { title: previous.title }, to: { title: input.title } } : {}),
      },
    });
    return list;
  });
}

export function moveList(actorId: string, listId: string, target: MoveTarget) {
  return prisma.$transaction(async (tx) => {
    const current = await findListOrThrow(tx, listId);
    const siblings = await activeSiblings(tx, current.boardId, listId);
    const { position, index, rebalanced } = await placeAmongSiblings(
      siblings,
      target,
      updateListPosition(tx),
    );
    const list = await tx.list.update({ where: { id: listId }, data: { position } });
    await recordActivity(tx, {
      boardId: list.boardId,
      actorId,
      type: 'list.moved',
      payload: { listId, index, position, rebalanced },
    });
    return list;
  });
}

export function setListArchived(actorId: string, listId: string, archived: boolean) {
  return prisma.$transaction(async (tx) => {
    await findListOrThrow(tx, listId);
    const list = await tx.list.update({
      where: { id: listId },
      data: { archivedAt: archived ? new Date() : null },
    });
    await recordActivity(tx, {
      boardId: list.boardId,
      actorId,
      type: archived ? 'list.archived' : 'list.restored',
      payload: { listId, title: list.title },
    });
    return list;
  });
}
