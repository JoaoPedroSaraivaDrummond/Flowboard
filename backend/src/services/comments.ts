import { forbidden, notFound } from '../errors.js';
import { prisma } from '../lib/prisma.js';
import { publicUserSelect } from '../schemas/common.js';
import { recordActivity, type Tx } from './activity.js';
import { findCardOrThrow } from './cards.js';

const commentInclude = { author: { select: publicUserSelect } } as const;

/** Comments can only be edited/deleted by their author. */
async function findOwnCommentOrThrow(tx: Tx, actorId: string, commentId: string) {
  const comment = await tx.comment.findUnique({
    where: { id: commentId },
    include: { card: { select: { list: { select: { boardId: true } } } } },
  });
  if (!comment) throw notFound('Comment');
  if (comment.authorId !== actorId) throw forbidden('Only the author can change this comment');
  return { ...comment, boardId: comment.card.list.boardId };
}

export async function listComments(cardId: string) {
  await findCardOrThrow(prisma, cardId);
  return prisma.comment.findMany({
    where: { cardId },
    orderBy: { createdAt: 'asc' },
    include: commentInclude,
  });
}

export function createComment(actorId: string, cardId: string, body: string) {
  return prisma.$transaction(async (tx) => {
    const card = await findCardOrThrow(tx, cardId);
    const comment = await tx.comment.create({
      data: { cardId, authorId: actorId, body },
      include: commentInclude,
    });
    await recordActivity(tx, {
      boardId: card.boardId,
      cardId,
      actorId,
      type: 'comment.created',
      payload: { commentId: comment.id },
    });
    return comment;
  });
}

export function updateComment(actorId: string, commentId: string, body: string) {
  return prisma.$transaction(async (tx) => {
    const current = await findOwnCommentOrThrow(tx, actorId, commentId);
    const comment = await tx.comment.update({
      where: { id: commentId },
      data: { body },
      include: commentInclude,
    });
    await recordActivity(tx, {
      boardId: current.boardId,
      cardId: current.cardId,
      actorId,
      type: 'comment.updated',
      payload: { commentId },
    });
    return comment;
  });
}

export function deleteComment(actorId: string, commentId: string) {
  return prisma.$transaction(async (tx) => {
    const current = await findOwnCommentOrThrow(tx, actorId, commentId);
    await tx.comment.delete({ where: { id: commentId } });
    await recordActivity(tx, {
      boardId: current.boardId,
      cardId: current.cardId,
      actorId,
      type: 'comment.deleted',
      payload: { commentId },
    });
  });
}
