import type { Prisma } from '@prisma/client';
import { notFound } from '../errors.js';
import { prisma } from '../lib/prisma.js';
import { publicUserSelect } from '../schemas/common.js';
import { recordActivity, type Tx } from './activity.js';
import { byPosition } from './ordering.js';

export const cardSummaryInclude = {
  labels: { select: { id: true, name: true, color: true } },
  assignee: { select: publicUserSelect },
  _count: { select: { comments: true, checklistItems: true } },
  // Enough to render checklist progress (done / total) on the card tile.
  checklistItems: { select: { done: true } },
  customFieldValues: { select: { fieldId: true, value: true } },
} as const;

export async function findBoardOrThrow(db: Tx, boardId: string) {
  const board = await db.board.findUnique({ where: { id: boardId } });
  if (!board) throw notFound('Board');
  return board;
}

export function listBoards(includeArchived: boolean) {
  return prisma.board.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { createdBy: { select: publicUserSelect } },
  });
}

export function createBoard(actorId: string, data: { title: string; description?: string | null }) {
  return prisma.$transaction(async (tx) => {
    const board = await tx.board.create({ data: { ...data, createdById: actorId } });
    await recordActivity(tx, {
      boardId: board.id,
      actorId,
      type: 'board.created',
      payload: { title: board.title },
    });
    return board;
  });
}

/** Board with its active lists, their active cards, and labels. */
export async function getBoardDetail(boardId: string) {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      createdBy: { select: publicUserSelect },
      labels: { orderBy: { name: 'asc' } },
      customFields: { orderBy: byPosition },
      templates: { orderBy: { name: 'asc' } },
      lists: {
        where: { archivedAt: null },
        orderBy: byPosition,
        include: {
          cards: { where: { archivedAt: null }, orderBy: byPosition, include: cardSummaryInclude },
        },
      },
    },
  });
  if (!board) throw notFound('Board');
  return board;
}

export function updateBoard(
  actorId: string,
  boardId: string,
  data: { title?: string; description?: string | null },
) {
  return prisma.$transaction(async (tx) => {
    await findBoardOrThrow(tx, boardId);
    const board = await tx.board.update({ where: { id: boardId }, data });
    await recordActivity(tx, {
      boardId,
      actorId,
      type: 'board.updated',
      payload: { changes: data },
    });
    return board;
  });
}

export function setBoardArchived(actorId: string, boardId: string, archived: boolean) {
  return prisma.$transaction(async (tx) => {
    await findBoardOrThrow(tx, boardId);
    const board = await tx.board.update({
      where: { id: boardId },
      data: { archivedAt: archived ? new Date() : null },
    });
    await recordActivity(tx, {
      boardId,
      actorId,
      type: archived ? 'board.archived' : 'board.restored',
    });
    return board;
  });
}

const PAGE_ACTIVITY_INCLUDE = { actor: { select: { id: true, name: true, type: true } } } as const;

/** Activity newest first, cursor-paginated by activity id. */
export async function paginateActivity(
  where: Prisma.ActivityWhereInput,
  limit: number,
  cursor?: string,
) {
  const items = await prisma.activity.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: PAGE_ACTIVITY_INCLUDE,
  });
  const hasMore = items.length > limit;
  const page = hasMore ? items.slice(0, limit) : items;
  return { items: page, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

export async function getBoardActivity(boardId: string, limit: number, cursor?: string) {
  await findBoardOrThrow(prisma, boardId);
  return paginateActivity({ boardId }, limit, cursor);
}
