import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParams, moveTargetSchema, paginationQuery } from '../schemas/common.js';
import {
  createCard,
  getCardActivity,
  getCardDetail,
  moveCard,
  setCardArchived,
  setCardLabel,
  updateCard,
} from '../services/cards.js';

const cardFields = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(50_000).nullable().optional().describe('Markdown'),
  dueDate: z.iso.datetime({ offset: true }).nullable().optional(),
  assigneeId: z.uuid().nullable().optional(),
});

const cardLabelParams = z.object({ id: z.uuid(), labelId: z.uuid() });

export const cardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/lists/:id/cards',
    {
      schema: {
        tags: ['cards'],
        summary: 'Create a card in a list (appended unless a target position is given)',
        params: idParams,
        body: moveTargetSchema.and(cardFields.extend({ labelIds: z.array(z.uuid()).optional() })),
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createCard(request.auth.userId, request.params.id, request.body)),
  );

  app.get(
    '/cards/:id',
    {
      schema: {
        tags: ['cards'],
        summary: 'Card detail with labels, comments and checklist',
        params: idParams,
      },
    },
    async (request) => getCardDetail(request.params.id),
  );

  app.get(
    '/cards/:id/activity',
    {
      schema: {
        tags: ['cards'],
        summary: 'Card activity, newest first (cursor pagination)',
        params: idParams,
        querystring: paginationQuery,
      },
    },
    async (request) =>
      getCardActivity(request.params.id, request.query.limit, request.query.cursor),
  );

  app.patch(
    '/cards/:id',
    {
      schema: {
        tags: ['cards'],
        summary: 'Update a card',
        params: idParams,
        body: cardFields
          .extend({ completed: z.boolean().describe('Mark as done / not done') })
          .partial(),
      },
    },
    async (request) => updateCard(request.auth.userId, request.params.id, request.body),
  );

  app.patch(
    '/cards/:id/move',
    {
      schema: {
        tags: ['cards'],
        summary:
          'Move a card to a list (default: its current list) at beforeId / afterId / index; end of list if omitted',
        params: idParams,
        body: moveTargetSchema.and(z.object({ listId: z.uuid().optional() })),
      },
    },
    async (request) => moveCard(request.auth.userId, request.params.id, request.body),
  );

  app.post(
    '/cards/:id/archive',
    { schema: { tags: ['cards'], summary: 'Archive a card', params: idParams } },
    async (request) => setCardArchived(request.auth.userId, request.params.id, true),
  );

  app.post(
    '/cards/:id/restore',
    { schema: { tags: ['cards'], summary: 'Restore an archived card', params: idParams } },
    async (request) => setCardArchived(request.auth.userId, request.params.id, false),
  );

  app.put(
    '/cards/:id/labels/:labelId',
    { schema: { tags: ['cards'], summary: 'Attach a label to a card', params: cardLabelParams } },
    async (request) =>
      setCardLabel(request.auth.userId, request.params.id, request.params.labelId, true),
  );

  app.delete(
    '/cards/:id/labels/:labelId',
    { schema: { tags: ['cards'], summary: 'Detach a label from a card', params: cardLabelParams } },
    async (request) =>
      setCardLabel(request.auth.userId, request.params.id, request.params.labelId, false),
  );
};
