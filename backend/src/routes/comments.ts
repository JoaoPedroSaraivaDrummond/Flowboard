import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParams } from '../schemas/common.js';
import { createComment, deleteComment, listComments, updateComment } from '../services/comments.js';

const commentBody = z.object({ body: z.string().trim().min(1).max(10_000) });

export const commentRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/cards/:id/comments',
    { schema: { tags: ['comments'], summary: 'List card comments', params: idParams } },
    async (request) => listComments(request.params.id),
  );

  app.post(
    '/cards/:id/comments',
    {
      schema: { tags: ['comments'], summary: 'Add a comment', params: idParams, body: commentBody },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createComment(request.auth.userId, request.params.id, request.body.body)),
  );

  app.patch(
    '/comments/:id',
    {
      schema: {
        tags: ['comments'],
        summary: 'Edit your comment',
        params: idParams,
        body: commentBody,
      },
    },
    async (request) => updateComment(request.auth.userId, request.params.id, request.body.body),
  );

  app.delete(
    '/comments/:id',
    { schema: { tags: ['comments'], summary: 'Delete your comment', params: idParams } },
    async (request, reply) => {
      await deleteComment(request.auth.userId, request.params.id);
      return reply.status(204).send();
    },
  );
};
