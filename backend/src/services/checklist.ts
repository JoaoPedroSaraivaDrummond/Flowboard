import { notFound } from '../errors.js';
import { prisma } from '../lib/prisma.js';
import type { MoveTarget } from '../schemas/common.js';
import { recordActivity, type Tx } from './activity.js';
import { findCardOrThrow } from './cards.js';
import { byPosition, placeAmongSiblings } from './ordering.js';

async function findItemOrThrow(tx: Tx, itemId: string) {
  const item = await tx.checklistItem.findUnique({
    where: { id: itemId },
    include: { card: { select: { list: { select: { boardId: true } } } } },
  });
  if (!item) throw notFound('Checklist item');
  const { card, ...rest } = item;
  return { ...rest, boardId: card.list.boardId };
}

function siblings(tx: Tx, cardId: string, excludeId?: string) {
  return tx.checklistItem.findMany({
    where: { cardId, ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: byPosition,
    select: { id: true, position: true },
  });
}

const updateItemPosition = (tx: Tx) => (id: string, position: number) =>
  tx.checklistItem.update({ where: { id }, data: { position } });

export async function listChecklistItems(cardId: string) {
  await findCardOrThrow(prisma, cardId);
  return prisma.checklistItem.findMany({ where: { cardId }, orderBy: byPosition });
}

export function createChecklistItem(
  actorId: string,
  cardId: string,
  data: { text: string; done?: boolean } & MoveTarget,
) {
  return prisma.$transaction(async (tx) => {
    const card = await findCardOrThrow(tx, cardId);
    const { text, done, ...target } = data;
    const { position } = await placeAmongSiblings(
      await siblings(tx, cardId),
      target,
      updateItemPosition(tx),
    );
    const item = await tx.checklistItem.create({ data: { cardId, text, done, position } });
    await recordActivity(tx, {
      boardId: card.boardId,
      cardId,
      actorId,
      type: 'checklist_item.created',
      payload: { itemId: item.id, text },
    });
    return item;
  });
}

export function updateChecklistItem(
  actorId: string,
  itemId: string,
  data: { text?: string; done?: boolean },
) {
  return prisma.$transaction(async (tx) => {
    const current = await findItemOrThrow(tx, itemId);
    const item = await tx.checklistItem.update({ where: { id: itemId }, data });
    await recordActivity(tx, {
      boardId: current.boardId,
      cardId: current.cardId,
      actorId,
      type: 'checklist_item.updated',
      payload: { itemId, changes: data },
    });
    return item;
  });
}

export function moveChecklistItem(actorId: string, itemId: string, target: MoveTarget) {
  return prisma.$transaction(async (tx) => {
    const current = await findItemOrThrow(tx, itemId);
    const { position, index, rebalanced } = await placeAmongSiblings(
      await siblings(tx, current.cardId, itemId),
      target,
      updateItemPosition(tx),
    );
    const item = await tx.checklistItem.update({ where: { id: itemId }, data: { position } });
    await recordActivity(tx, {
      boardId: current.boardId,
      cardId: current.cardId,
      actorId,
      type: 'checklist_item.moved',
      payload: { itemId, index, position, rebalanced },
    });
    return item;
  });
}

export function deleteChecklistItem(actorId: string, itemId: string) {
  return prisma.$transaction(async (tx) => {
    const current = await findItemOrThrow(tx, itemId);
    await tx.checklistItem.delete({ where: { id: itemId } });
    await recordActivity(tx, {
      boardId: current.boardId,
      cardId: current.cardId,
      actorId,
      type: 'checklist_item.deleted',
      payload: { itemId, text: current.text },
    });
  });
}
