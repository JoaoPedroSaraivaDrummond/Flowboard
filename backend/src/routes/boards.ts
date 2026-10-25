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
import { addMember, listMembers, removeMember } from '../services/members.js';

const boardBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).nullable().optional(),
});

export const boardRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/boards',
    { schema: { tags: ['boards'], summary: 'List boards', querystring: archivedQuery } },
    async (request) => listBoards(request.auth.accessUserId, request.query.includeArchived),
  );

  app.post(
    '/boards',
    { schema: { tags: ['boards'], summary: 'Create a board', body: boardBody } },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createBoard(request.auth.userId, request.body, request.auth.accessUserId)),
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

  app.get(
    '/boards/:id/members',
    { schema: { tags: ['boards'], summary: 'Board members and their roles', params: idParams } },
    async (request) => listMembers(request.params.id),
  );

  app.post(
    '/boards/:id/members',
    {
      schema: {
        tags: ['boards'],
        summary: 'Add (or change the role of) a member by e-mail. Owners only.',
        params: idParams,
        body: z.object({
          email: z.email(),
          role: z.enum(['owner', 'member']).default('member'),
        }),
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await addMember(request.auth.accessUserId, request.params.id, request.body)),
  );

  app.delete(
    '/boards/:id/members/:userId',
    {
      schema: {
        tags: ['boards'],
        summary: 'Remove a member (owners), or leave the board (yourself)',
        params: idParams.extend({ userId: z.uuid() }),
      },
    },
    async (request, reply) => {
      await removeMember(request.auth.accessUserId, request.params.id, request.params.userId);
      return reply.status(204).send();
    },
  );
};
