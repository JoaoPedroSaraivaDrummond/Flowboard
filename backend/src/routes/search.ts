import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { listUsers } from '../services/auth.js';
import { searchCards } from '../services/cards.js';

export const searchRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/search',
    {
      schema: {
        tags: ['search'],
        summary: 'Case-insensitive search in active card titles and descriptions',
        querystring: z.object({
          q: z.string().trim().min(1).max(200),
          boardId: z.uuid().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(50),
        }),
      },
    },
    async (request) => {
      const { q, boardId, limit } = request.query;
      return searchCards(request.auth.accessUserId, q, { boardId, limit });
    },
  );

  app.get(
    '/users',
    { schema: { tags: ['users'], summary: 'List users (e.g. to pick an assignee)' } },
    async (request) => listUsers(request.auth.accessUserId),
  );
};
