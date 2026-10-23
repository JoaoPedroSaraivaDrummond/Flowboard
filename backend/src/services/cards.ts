import type { List } from '@prisma/client';
import { badRequest, notFound } from '../errors.js';
import { prisma } from '../lib/prisma.js';
import { publicUserSelect, type MoveTarget } from '../schemas/common.js';
import { recordActivity, type Tx } from './activity.js';
import { cardSummaryInclude, paginateActivity } from './boards.js';
import { findListOrThrow } from './lists.js';
import { byPosition, placeAmongSiblings } from './ordering.js';
import { enterList, lockList, assertWipCapacity } from './rules.js';

export const cardDetailInclude = {
  ...cardSummaryInclude,
  list: { select: { id: true, title: true, boardId: true } },
  comments: {
    orderBy: { createdAt: 'asc' },
    include: { author: { select: publicUserSelect } },
  },
  checklistItems: { orderBy: byPosition },
  customFieldValues: {
    select: { fieldId: true, value: true, field: { select: { name: true, type: true } } },
    orderBy: { field: { position: 'asc' } },
  },
} as const;

/** Card plus the board it belongs to (for activity logging and board-scoped checks). */
export async function findCardOrThrow(db: Tx, cardId: string) {
  const card = await db.card.findUnique({
    where: { id: cardId },
    include: { list: { select: { boardId: true } } },
  });
  if (!card) throw notFound('Card');
  return { ...card, boardId: card.list.boardId };
}

async function assertAssigneeExists(tx: Tx, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  const user = await tx.user.findUnique({ where: { id: assigneeId }, select: { id: true } });
  if (!user) throw badRequest(`User ${assigneeId} does not exist`, 'INVALID_ASSIGNEE');
}

export async function assertLabelsBelongToBoard(tx: Tx, boardId: string, labelIds: string[]) {
  if (labelIds.length === 0) return;
  const count = await tx.label.count({ where: { boardId, id: { in: labelIds } } });
  if (count !== new Set(labelIds).size) {
    throw badRequest('All labels must belong to the card board', 'INVALID_LABEL');
  }
}

export function activeCardSiblings(tx: Tx, listId: string, excludeId?: string) {
  return tx.card.findMany({
    where: { listId, archivedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
    orderBy: byPosition,
    select: { id: true, position: true },
  });
}

export const updateCardPosition = (tx: Tx) => (id: string, position: number) =>
  tx.card.update({ where: { id }, data: { position } });

export type CreateCardInput = {
  title: string;
  description?: string | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  labelIds?: string[];
  /** Checklist item texts, e.g. from a template. */
  checklist?: string[];
} & MoveTarget;

/** Shared by plain creation and template instantiation; runs inside the caller's transaction. */
export async function createCardInList(
  tx: Tx,
  actorId: string,
  list: List,
  input: CreateCardInput,
  extraPayload: Record<string, string> = {},
) {
  const {
    title,
    description,
    dueDate,
    assigneeId,
    labelIds = [],
    checklist = [],
    ...target
  } = input;
  await assertAssigneeExists(tx, assigneeId);
  await assertLabelsBelongToBoard(tx, list.boardId, labelIds);
  const automation = await enterList(tx, list);

  const siblings = await activeCardSiblings(tx, list.id);
  const { position } = await placeAmongSiblings(siblings, target, updateCardPosition(tx));
  const card = await tx.card.create({
    data: {
      listId: list.id,
      title,
      description,
      position,
      dueDate: dueDate ? new Date(dueDate) : null,
      assigneeId: assigneeId ?? null,
      labels: { connect: labelIds.map((id) => ({ id })) },
      checklistItems: {
        create: checklist.map((text, index) => ({ text, position: (index + 1) * 1024 })),
      },
    },
  });
  // Automations run after creation; an explicit assignee given by the caller wins.
  const { assigneeId: autoAssignee, ...automationData } = automation.data;
  await tx.card.update({
    where: { id: card.id },
    data: { ...automationData, ...(assigneeId ? {} : { assigneeId: autoAssignee }) },
  });
  await recordActivity(tx, {
    boardId: list.boardId,
    cardId: card.id,
    actorId,
    type: 'card.created',
    payload: {
      title,
      listId: list.id,
      ...extraPayload,
      ...(automation.applied ? { automations: automation.applied } : {}),
    },
  });
  return tx.card.findUniqueOrThrow({ where: { id: card.id }, include: cardSummaryInclude });
}

export function createCard(actorId: string, listId: string, input: CreateCardInput) {
  return prisma.$transaction(async (tx) => {
    const list = await findListOrThrow(tx, listId);
    return createCardInList(tx, actorId, list, input);
  });
}

export async function getCardDetail(cardId: string) {
  const card = await prisma.card.findUnique({ where: { id: cardId }, include: cardDetailInclude });
  if (!card) throw notFound('Card');
  return card;
}

export async function getCardActivity(cardId: string, limit: number, cursor?: string) {
  await findCardOrThrow(prisma, cardId);
  return paginateActivity({ cardId }, limit, cursor);
}

export type UpdateCardInput = {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  completed?: boolean;
};

export function updateCard(actorId: string, cardId: string, input: UpdateCardInput) {
  return prisma.$transaction(async (tx) => {
    const current = await findCardOrThrow(tx, cardId);
    await assertAssigneeExists(tx, input.assigneeId);
    const { completed, dueDate, ...fields } = input;
    const card = await tx.card.update({
      where: { id: cardId },
      data: {
        ...fields,
        dueDate: dueDate === undefined ? undefined : dueDate && new Date(dueDate),
        completedAt:
          completed === undefined
            ? undefined
            : completed
              ? (current.completedAt ?? new Date())
              : null,
      },
      include: cardSummaryInclude,
    });
    await recordActivity(tx, {
      boardId: current.boardId,
      cardId,
      actorId,
      type: 'card.updated',
      payload: { changes: input },
    });
    return card;
  });
}

/** Moves within the same transaction; list rules apply when the card changes lists. */
export async function moveCardInTx(
  tx: Tx,
  actorId: string,
  cardId: string,
  input: { listId?: string } & MoveTarget,
  activityType: 'card.moved' | 'card.claimed' = 'card.moved',
  overrides: { assigneeId?: string } = {},
) {
  const current = await findCardOrThrow(tx, cardId);
  const { listId: targetListId = current.listId, ...target } = input;
  const targetList = await findListOrThrow(tx, targetListId);
  if (targetList.boardId !== current.boardId) {
    throw badRequest('Cards can only be moved between lists of the same board', 'CROSS_BOARD_MOVE');
  }

  const changesList = targetListId !== current.listId;
  const automation = changesList ? await enterList(tx, targetList) : { data: {}, applied: null };

  const siblings = await activeCardSiblings(tx, targetListId, cardId);
  const { position, index, rebalanced } = await placeAmongSiblings(
    siblings,
    target,
    updateCardPosition(tx),
  );
  const card = await tx.card.update({
    where: { id: cardId },
    data: { ...automation.data, ...overrides, listId: targetListId, position },
    include: cardSummaryInclude,
  });
  await recordActivity(tx, {
    boardId: current.boardId,
    cardId,
    actorId,
    type: activityType,
    payload: {
      fromListId: current.listId,
      toListId: targetListId,
      index,
      position,
      rebalanced,
      ...(automation.applied ? { automations: automation.applied } : {}),
    },
  });
  return card;
}

export function moveCard(actorId: string, cardId: string, input: { listId?: string } & MoveTarget) {
  return prisma.$transaction((tx) => moveCardInTx(tx, actorId, cardId, input));
}

export function setCardArchived(actorId: string, cardId: string, archived: boolean) {
  return prisma.$transaction(async (tx) => {
    const current = await findCardOrThrow(tx, cardId);
    if (!archived && current.archivedAt) {
      // Restoring puts the card back into its list: respect the WIP limit.
      await lockList(tx, current.listId);
      await assertWipCapacity(tx, await findListOrThrow(tx, current.listId));
    }
    const card = await tx.card.update({
      where: { id: cardId },
      data: { archivedAt: archived ? new Date() : null },
      include: cardSummaryInclude,
    });
    await recordActivity(tx, {
      boardId: current.boardId,
      cardId,
      actorId,
      type: archived ? 'card.archived' : 'card.restored',
      payload: { title: card.title },
    });
    return card;
  });
}

export function setCardLabel(actorId: string, cardId: string, labelId: string, attached: boolean) {
  return prisma.$transaction(async (tx) => {
    const current = await findCardOrThrow(tx, cardId);
    await assertLabelsBelongToBoard(tx, current.boardId, [labelId]);
    const card = await tx.card.update({
      where: { id: cardId },
      data: { labels: attached ? { connect: { id: labelId } } : { disconnect: { id: labelId } } },
      include: cardSummaryInclude,
    });
    await recordActivity(tx, {
      boardId: current.boardId,
      cardId,
      actorId,
      type: attached ? 'card.label_added' : 'card.label_removed',
      payload: { labelId },
    });
    return card;
  });
}

export function searchCards(query: string, options: { boardId?: string; limit: number }) {
  return prisma.card.findMany({
    where: {
      archivedAt: null,
      list: {
        archivedAt: null,
        board: { archivedAt: null, ...(options.boardId ? { id: options.boardId } : {}) },
      },
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
    orderBy: { updatedAt: 'desc' },
    take: options.limit,
    include: {
      ...cardSummaryInclude,
      list: {
        select: { id: true, title: true, board: { select: { id: true, title: true } } },
      },
    },
  });
}
