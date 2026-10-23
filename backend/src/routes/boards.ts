import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { archivedQuery, idParams, paginationQuery } from '../schemas/common.js';
import {
  createBoard,
  getBoardActivity,
  getBoardDetail,
  listBoards,
  setBoardArchived,
  updateBoard,
} from '../services/boards.js';

const boardBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).nullable().optional(),
});

export const boardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/boards',
    { schema: { tags: ['boards'], summary: 'List boards', querystring: archivedQuery } },
    async (request) => listBoards(request.query.includeArchived),
  );

  app.post(
    '/boards',
    { schema: { tags: ['boards'], summary: 'Create a board', body: boardBody } },
    async (request, reply) =>
      reply.status(201).send(await createBoard(request.auth.userId, request.body)),
  );

  app.get(
    '/boards/:id',
    {
      schema: {
        tags: ['boards'],
        summary: 'Get a board with its active lists, cards and labels',
        params: idParams,
      },
    },
    async (request) => getBoardDetail(request.params.id),
  );

  app.patch(
    '/boards/:id',
    {
      schema: {
        tags: ['boards'],
        summary: 'Update a board',
        params: idParams,
        body: boardBody.partial(),
      },
    },
    async (request) => updateBoard(request.auth.userId, request.params.id, request.body),
  );

  app.post(
    '/boards/:id/archive',
    { schema: { tags: ['boards'], summary: 'Archive a board', params: idParams } },
    async (request) => setBoardArchived(request.auth.userId, request.params.id, true),
  );

  app.post(
    '/boards/:id/restore',
    { schema: { tags: ['boards'], summary: 'Restore an archived board', params: idParams } },
    async (request) => setBoardArchived(request.auth.userId, request.params.id, false),
  );

  app.get(
    '/boards/:id/activity',
    {
      schema: {
        tags: ['boards'],
        summary: 'Board activity, newest first (cursor pagination)',
        params: idParams,
        querystring: paginationQuery,
      },
    },
    async (request) =>
      getBoardActivity(request.params.id, request.query.limit, request.query.cursor),
  );
};
