import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParams } from '../schemas/common.js';
import { createLabel, deleteLabel, listLabels, updateLabel } from '../services/labels.js';

const labelBody = z.object({
  name: z.string().trim().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a hex color like #22c55e'),
});

export const labelRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/boards/:id/labels',
    { schema: { tags: ['labels'], summary: 'List board labels', params: idParams } },
    async (request) => listLabels(request.params.id),
  );

  app.post(
    '/boards/:id/labels',
    { schema: { tags: ['labels'], summary: 'Create a label', params: idParams, body: labelBody } },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createLabel(request.auth.userId, request.params.id, request.body)),
  );

  app.patch(
    '/labels/:id',
    {
      schema: {
        tags: ['labels'],
        summary: 'Update a label',
        params: idParams,
        body: labelBody.partial(),
      },
    },
    async (request) => updateLabel(request.auth.userId, request.params.id, request.body),
  );

  app.delete(
    '/labels/:id',
    {
      schema: {
        tags: ['labels'],
        summary: 'Delete a label (detaches it from cards)',
        params: idParams,
      },
    },
    async (request, reply) => {
      await deleteLabel(request.auth.userId, request.params.id);
      return reply.status(204).send();
    },
  );
};
