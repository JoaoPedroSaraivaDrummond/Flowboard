import { conflict, notFound } from '../errors.js';
import { prisma } from '../lib/prisma.js';
import type { MoveTarget } from '../schemas/common.js';
import { recordActivity, type Tx } from './activity.js';
import { findBoardOrThrow } from './boards.js';
import { createCardInList } from './cards.js';
import { findListOrThrow } from './lists.js';
import { badRequest } from '../errors.js';

export type TemplateInput = { name: string; description?: string | null; checklist?: string[] };

async function findTemplateOrThrow(tx: Tx, templateId: string) {
  const template = await tx.cardTemplate.findUnique({ where: { id: templateId } });
  if (!template) throw notFound('Template');
  return template;
}

async function assertNameAvailable(tx: Tx, boardId: string, name: string, exceptId?: string) {
  const existing = await tx.cardTemplate.findFirst({
    where: { boardId, name: { equals: name, mode: 'insensitive' }, NOT: { id: exceptId } },
  });
  if (existing) throw conflict(`A template named "${name}" already exists on this board`);
}

const cleanChecklist = (items: string[] | undefined) =>
  items?.map((item) => item.trim()).filter(Boolean);

export async function listTemplates(boardId: string) {
  await findBoardOrThrow(prisma, boardId);
  return prisma.cardTemplate.findMany({ where: { boardId }, orderBy: { name: 'asc' } });
}

export function createTemplate(actorId: string, boardId: string, data: TemplateInput) {
  return prisma.$transaction(async (tx) => {
    await findBoardOrThrow(tx, boardId);
    await assertNameAvailable(tx, boardId, data.name);
    const template = await tx.cardTemplate.create({
      data: {
        boardId,
        name: data.name,
        description: data.description ?? null,
        checklist: cleanChecklist(data.checklist) ?? [],
      },
    });
    await recordActivity(tx, {
      boardId,
      actorId,
      type: 'template.created',
      payload: { templateId: template.id, name: template.name },
    });
    return template;
  });
}

export function updateTemplate(actorId: string, templateId: string, data: Partial<TemplateInput>) {
  return prisma.$transaction(async (tx) => {
    const current = await findTemplateOrThrow(tx, templateId);
    if (data.name) await assertNameAvailable(tx, current.boardId, data.name, templateId);
    const template = await tx.cardTemplate.update({
      where: { id: templateId },
      data: { ...data, checklist: cleanChecklist(data.checklist) },
    });
    await recordActivity(tx, {
      boardId: template.boardId,
      actorId,
      type: 'template.updated',
      payload: { templateId, name: template.name },
    });
    return template;
  });
}

export function deleteTemplate(actorId: string, templateId: string) {
  return prisma.$transaction(async (tx) => {
    const template = await findTemplateOrThrow(tx, templateId);
    await tx.cardTemplate.delete({ where: { id: templateId } });
    await recordActivity(tx, {
      boardId: template.boardId,
      actorId,
      type: 'template.deleted',
      payload: { templateId, name: template.name },
    });
  });
}

/** New card with the template's description and checklist; the title defaults to the template name. */
export function createCardFromTemplate(
  actorId: string,
  listId: string,
  input: { templateId: string; title?: string } & MoveTarget,
) {
  return prisma.$transaction(async (tx) => {
    const list = await findListOrThrow(tx, listId);
    const { templateId, title, ...target } = input;
    const template = await findTemplateOrThrow(tx, templateId);
    if (template.boardId !== list.boardId) {
      throw badRequest('The template belongs to another board', 'INVALID_TEMPLATE');
    }
    return createCardInList(
      tx,
      actorId,
      list,
      {
        title: title ?? template.name,
        description: template.description,
        checklist: template.checklist,
        ...target,
      },
      { templateId: template.id, templateName: template.name },
    );
  });
}
