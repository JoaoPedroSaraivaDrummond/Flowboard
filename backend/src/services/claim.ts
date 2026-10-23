import { AppError, badRequest } from '../errors.js';
import { prisma } from '../lib/prisma.js';
import type { Tx } from './activity.js';
import { getCardDetail, moveCardInTx } from './cards.js';
import { findListOrThrow } from './lists.js';
import { lockList } from './rules.js';

/** Waiting for the list lock can take a while when many agents claim at once. */
const CLAIM_TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

async function boardList(tx: Tx, boardId: string, listId: string, role: string) {
  const list = await findListOrThrow(tx, listId);
  if (list.boardId !== boardId || list.archivedAt) {
    throw badRequest(`${role} must be an active list of this board`, 'INVALID_LIST');
  }
  return list;
}

/**
 * Atomically takes the top card of `fromListId`, assigns it to the actor and moves it to the end of
 * `toListId` (WIP limit and automations of the target list apply).
 *
 * Concurrency: the source list row is locked first, so concurrent claims from the same list run one
 * after another and each sees the previous claim's result — two agents never get the same card.
 * The top card is also selected `FOR UPDATE SKIP LOCKED` so a card being moved by another
 * transaction is skipped rather than waited on.
 */
export async function claimNextCard(
  actorId: string,
  boardId: string,
  fromListId: string,
  toListId: string,
) {
  if (fromListId === toListId) throw badRequest('fromList and toList must differ', 'INVALID_LIST');

  const cardId = await prisma.$transaction(async (tx) => {
    const from = await boardList(tx, boardId, fromListId, 'fromList');
    await boardList(tx, boardId, toListId, 'toList');
    await lockList(tx, from.id);

    const [top] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Card"
      WHERE "listId" = ${from.id}::uuid AND "archivedAt" IS NULL
      ORDER BY position ASC, id ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED`;
    if (!top) {
      throw new AppError(404, 'NO_CARD_TO_CLAIM', `List "${from.title}" has no cards to claim`);
    }

    await moveCardInTx(tx, actorId, top.id, { listId: toListId }, 'card.claimed', {
      assigneeId: actorId,
    });
    return top.id;
  }, CLAIM_TX_OPTIONS);

  return getCardDetail(cardId);
}
