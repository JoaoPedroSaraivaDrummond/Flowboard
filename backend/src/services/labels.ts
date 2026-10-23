import { notFound } from '../errors.js';
import { prisma } from '../lib/prisma.js';
import { recordActivity } from './activity.js';
import { findBoardOrThrow } from './boards.js';

export async function listLabels(boardId: string) {
  await findBoardOrThrow(prisma, boardId);
  return prisma.label.findMany({ where: { boardId }, orderBy: { name: 'asc' } });
}

export function createLabel(
  actorId: string,
  boardId: string,
  data: { name: string; color: string },
) {
  return prisma.$transaction(async (tx) => {
    await findBoardOrThrow(tx, boardId);
    const label = await tx.label.create({ data: { ...data, boardId } });
    await recordActivity(tx, {
      boardId,
      actorId,
      type: 'label.created',
      payload: { labelId: label.id, ...data },
    });
    return label;
  });
}

export function updateLabel(
  actorId: string,
  labelId: string,
  data: { name?: string; color?: string },
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.label.findUnique({ where: { id: labelId } });
    if (!current) throw notFound('Label');
    const label = await tx.label.update({ where: { id: labelId }, data });
    await recordActivity(tx, {
      boardId: label.boardId,
      actorId,
      type: 'label.updated',
      payload: { labelId, changes: data },
    });
    return label;
  });
}

export function deleteLabel(actorId: string, labelId: string) {
  return prisma.$transaction(async (tx) => {
    const label = await tx.label.findUnique({ where: { id: labelId } });
    if (!label) throw notFound('Label');
    await tx.label.delete({ where: { id: labelId } });
    await recordActivity(tx, {
      boardId: label.boardId,
      actorId,
      type: 'label.deleted',
      payload: { labelId, name: label.name },
    });
  });
}
