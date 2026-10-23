import type { CustomField, CustomFieldType } from '@prisma/client';
import { badRequest, conflict, notFound } from '../errors.js';
import { prisma } from '../lib/prisma.js';
import { recordActivity, type Tx } from './activity.js';
import { findBoardOrThrow } from './boards.js';
import { findCardOrThrow } from './cards.js';
import { byPosition } from './ordering.js';
import { POSITION_STEP } from '../lib/position.js';

const MAX_TEXT_LENGTH = 1000;

async function findFieldOrThrow(tx: Tx, fieldId: string) {
  const field = await tx.customField.findUnique({ where: { id: fieldId } });
  if (!field) throw notFound('Custom field');
  return field;
}

function normalizeOptions(type: CustomFieldType, options: string[] | undefined): string[] {
  const cleaned = [...new Set((options ?? []).map((option) => option.trim()).filter(Boolean))];
  if (type === 'select' && cleaned.length === 0) {
    throw badRequest('Select fields need at least one option', 'INVALID_CUSTOM_FIELD');
  }
  return type === 'select' ? cleaned : [];
}

async function assertNameAvailable(tx: Tx, boardId: string, name: string, exceptId?: string) {
  const existing = await tx.customField.findFirst({
    where: { boardId, name: { equals: name, mode: 'insensitive' }, NOT: { id: exceptId } },
  });
  if (existing) throw conflict(`A field named "${name}" already exists on this board`);
}

/**
 * Validates a raw value against the field type and returns its canonical text form.
 * `null`/empty clears the value.
 */
export function normalizeFieldValue(
  field: CustomField,
  raw: string | number | null,
): string | null {
  if (raw === null || (typeof raw === 'string' && raw.trim() === '')) return null;
  const text = String(raw).trim();
  const invalid = (reason: string) =>
    badRequest(
      `Invalid value for "${field.name}" (${field.type}): ${reason}`,
      'INVALID_CUSTOM_FIELD_VALUE',
    );

  switch (field.type) {
    case 'text':
      if (text.length > MAX_TEXT_LENGTH) throw invalid(`at most ${MAX_TEXT_LENGTH} characters`);
      return text;
    case 'number': {
      const value = typeof raw === 'number' ? raw : Number(text.replace(',', '.'));
      if (!Number.isFinite(value)) throw invalid('expected a number');
      return String(value);
    }
    case 'url': {
      let url: URL;
      try {
        url = new URL(text);
      } catch {
        throw invalid('expected an absolute URL like https://...');
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalid('only http(s) URLs');
      return url.toString();
    }
    case 'select': {
      const option = field.options.find((o) => o.toLowerCase() === text.toLowerCase());
      if (!option) throw invalid(`expected one of: ${field.options.join(', ')}`);
      return option;
    }
  }
}

export async function listCustomFields(boardId: string) {
  await findBoardOrThrow(prisma, boardId);
  return prisma.customField.findMany({ where: { boardId }, orderBy: byPosition });
}

export function createCustomField(
  actorId: string,
  boardId: string,
  data: { name: string; type: CustomFieldType; options?: string[] },
) {
  return prisma.$transaction(async (tx) => {
    await findBoardOrThrow(tx, boardId);
    await assertNameAvailable(tx, boardId, data.name);
    const last = await tx.customField.findFirst({
      where: { boardId },
      orderBy: { position: 'desc' },
    });
    const field = await tx.customField.create({
      data: {
        boardId,
        name: data.name,
        type: data.type,
        options: normalizeOptions(data.type, data.options),
        position: (last?.position ?? 0) + POSITION_STEP,
      },
    });
    await recordActivity(tx, {
      boardId,
      actorId,
      type: 'custom_field.created',
      payload: { fieldId: field.id, name: field.name, fieldType: field.type },
    });
    return field;
  });
}

export function updateCustomField(
  actorId: string,
  fieldId: string,
  data: { name?: string; options?: string[] },
) {
  return prisma.$transaction(async (tx) => {
    const current = await findFieldOrThrow(tx, fieldId);
    if (data.name) await assertNameAvailable(tx, current.boardId, data.name, fieldId);
    const field = await tx.customField.update({
      where: { id: fieldId },
      data: {
        name: data.name,
        options:
          data.options === undefined ? undefined : normalizeOptions(current.type, data.options),
      },
    });
    await recordActivity(tx, {
      boardId: field.boardId,
      actorId,
      type: 'custom_field.updated',
      payload: { fieldId, changes: data },
    });
    return field;
  });
}

/** Removes the field definition and its values from every card. */
export function deleteCustomField(actorId: string, fieldId: string) {
  return prisma.$transaction(async (tx) => {
    const field = await findFieldOrThrow(tx, fieldId);
    await tx.customField.delete({ where: { id: fieldId } });
    await recordActivity(tx, {
      boardId: field.boardId,
      actorId,
      type: 'custom_field.deleted',
      payload: { fieldId, name: field.name },
    });
  });
}

export function setCardFieldValue(
  actorId: string,
  cardId: string,
  fieldId: string,
  raw: string | number | null,
) {
  return prisma.$transaction(async (tx) => {
    const card = await findCardOrThrow(tx, cardId);
    const field = await findFieldOrThrow(tx, fieldId);
    if (field.boardId !== card.boardId) {
      throw badRequest('The field belongs to another board', 'INVALID_CUSTOM_FIELD');
    }
    const value = normalizeFieldValue(field, raw);
    if (value === null) {
      await tx.cardCustomFieldValue.deleteMany({ where: { cardId, fieldId } });
    } else {
      await tx.cardCustomFieldValue.upsert({
        where: { cardId_fieldId: { cardId, fieldId } },
        create: { cardId, fieldId, value },
        update: { value },
      });
    }
    await recordActivity(tx, {
      boardId: card.boardId,
      cardId,
      actorId,
      type: 'card.custom_field_set',
      payload: { fieldId, name: field.name, value },
    });
    return { fieldId, name: field.name, type: field.type, value };
  });
}
