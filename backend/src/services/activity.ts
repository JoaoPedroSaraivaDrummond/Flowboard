import type { Prisma } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

export type ActivityType =
  | 'board.created'
  | 'board.updated'
  | 'board.archived'
  | 'board.restored'
  | 'list.created'
  | 'list.updated'
  | 'list.moved'
  | 'list.archived'
  | 'list.restored'
  | 'card.created'
  | 'card.updated'
  | 'card.moved'
  | 'card.archived'
  | 'card.restored'
  | 'card.label_added'
  | 'card.label_removed'
  | 'card.claimed'
  | 'card.custom_field_set'
  | 'custom_field.created'
  | 'custom_field.updated'
  | 'custom_field.deleted'
  | 'template.created'
  | 'template.updated'
  | 'template.deleted'
  | 'label.created'
  | 'label.updated'
  | 'label.deleted'
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'checklist_item.created'
  | 'checklist_item.updated'
  | 'checklist_item.moved'
  | 'checklist_item.deleted';

export type ActivityInput = {
  boardId: string;
  cardId?: string | null;
  actorId: string;
  type: ActivityType;
  payload?: Prisma.InputJsonObject;
};

/** Must be called inside the same transaction as the mutation it describes. */
export async function recordActivity(tx: Tx, input: ActivityInput): Promise<void> {
  await tx.activity.create({
    data: {
      boardId: input.boardId,
      cardId: input.cardId ?? null,
      actorId: input.actorId,
      type: input.type,
      payload: input.payload ?? {},
    },
  });
}
