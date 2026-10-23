import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParams, moveTargetSchema } from '../schemas/common.js';
import { createList, getList, moveList, setListArchived, updateList } from '../services/lists.js';

const title = z.string().trim().min(1).max(200);

export const listRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/boards/:id/lists',
    {
      schema: {
        tags: ['lists'],
        summary: 'Create a list in a board (appended unless a target position is given)',
        params: idParams,
        body: moveTargetSchema.and(z.object({ title })),
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createList(request.auth.userId, request.params.id, request.body)),
  );

  app.get(
    '/lists/:id',
    { schema: { tags: ['lists'], summary: 'Get a list (with its rules)', params: idParams } },
    async (request) => getList(request.params.id),
  );

  app.patch(
    '/lists/:id',
    {
      schema: {
        tags: ['lists'],
        summary: 'Rename a list and/or change its rules (WIP limit, on-enter automations)',
        params: idParams,
        body: z
          .object({
            title,
            wipLimit: z
              .number()
              .int()
              .min(1)
              .nullable()
              .describe('Max active cards; null removes the limit'),
            onEnterMarkDone: z.boolean().describe('Mark cards as done when they enter the list'),
            onEnterAssigneeId: z
              .uuid()
              .nullable()
              .describe('Assign cards to this user when they enter the list'),
            onEnterLabelId: z
              .uuid()
              .nullable()
              .describe('Add this label to cards when they enter the list'),
          })
          .partial()
          .refine((body) => Object.keys(body).length > 0, { message: 'Nothing to update' }),
      },
    },
    async (request) => updateList(request.auth.userId, request.params.id, request.body),
  );

  app.patch(
    '/lists/:id/move',
    {
      schema: {
        tags: ['lists'],
        summary: 'Reorder a list (beforeId / afterId / index among active lists)',
        params: idParams,
        body: moveTargetSchema,
      },
    },
    async (request) => moveList(request.auth.userId, request.params.id, request.body),
  );

  app.post(
    '/lists/:id/archive',
    { schema: { tags: ['lists'], summary: 'Archive a list', params: idParams } },
    async (request) => setListArchived(request.auth.userId, request.params.id, true),
  );

  app.post(
    '/lists/:id/restore',
    { schema: { tags: ['lists'], summary: 'Restore an archived list', params: idParams } },
    async (request) => setListArchived(request.auth.userId, request.params.id, false),
  );
};
