import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { idParams } from '../schemas/common.js';
import { createApiToken, deleteApiToken, listApiTokens, renameApiToken } from '../services/auth.js';

const tokenBody = z.object({ name: z.string().trim().min(1).max(100) });

export const tokenRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/tokens',
    {
      schema: {
        tags: ['tokens'],
        summary: "List your API tokens, or an agent user's (never includes the secret)",
        querystring: z.object({ userId: z.uuid().optional().describe('Agent user id') }),
      },
    },
    async (request) =>
      listApiTokens(request.auth.userId, request.auth.accessUserId, request.query.userId),
  );

  app.post(
    '/tokens',
    {
      schema: {
        tags: ['tokens'],
        summary:
          'Create an API token for yourself or for an agent user (userId). The plain `token` is returned only in this response.',
        body: tokenBody.extend({ userId: z.uuid().optional().describe('Agent user id') }),
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(
          await createApiToken(
            request.auth.userId,
            request.auth.accessUserId,
            request.body.name,
            request.body.userId,
          ),
        ),
  );

  app.patch(
    '/tokens/:id',
    {
      schema: {
        tags: ['tokens'],
        summary: 'Rename an API token',
        params: idParams,
        body: tokenBody,
      },
    },
    async (request) =>
      renameApiToken(
        request.auth.userId,
        request.auth.accessUserId,
        request.params.id,
        request.body.name,
      ),
  );

  app.delete(
    '/tokens/:id',
    { schema: { tags: ['tokens'], summary: 'Revoke an API token', params: idParams } },
    async (request, reply) => {
      await deleteApiToken(request.auth.userId, request.auth.accessUserId, request.params.id);
      return reply.status(204).send();
    },
  );
};
