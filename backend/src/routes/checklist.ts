import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParams, moveTargetSchema } from '../schemas/common.js';
import {
  createChecklistItem,
  deleteChecklistItem,
  listChecklistItems,
  moveChecklistItem,
  updateChecklistItem,
} from '../services/checklist.js';

const itemFields = z.object({
  text: z.string().trim().min(1).max(1000),
  done: z.boolean().optional(),
});

export const checklistRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/cards/:id/checklist',
    { schema: { tags: ['checklist'], summary: 'List checklist items', params: idParams } },
    async (request) => listChecklistItems(request.params.id),
  );

  app.post(
    '/cards/:id/checklist',
    {
      schema: {
        tags: ['checklist'],
        summary: 'Add a checklist item (appended unless a target position is given)',
        params: idParams,
        body: moveTargetSchema.and(itemFields),
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createChecklistItem(request.auth.userId, request.params.id, request.body)),
  );

  app.patch(
    '/checklist-items/:id',
    {
      schema: {
        tags: ['checklist'],
        summary: 'Update text / toggle done',
        params: idParams,
        body: itemFields.partial(),
      },
    },
    async (request) => updateChecklistItem(request.auth.userId, request.params.id, request.body),
  );

  app.patch(
    '/checklist-items/:id/move',
    {
      schema: {
        tags: ['checklist'],
        summary: 'Reorder a checklist item',
        params: idParams,
        body: moveTargetSchema,
      },
    },
    async (request) => moveChecklistItem(request.auth.userId, request.params.id, request.body),
  );

  app.delete(
    '/checklist-items/:id',
    { schema: { tags: ['checklist'], summary: 'Delete a checklist item', params: idParams } },
    async (request, reply) => {
      await deleteChecklistItem(request.auth.userId, request.params.id);
      return reply.status(204).send();
    },
  );
};
