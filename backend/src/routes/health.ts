import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { prisma } from '../lib/prisma.js';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    { schema: { tags: ['health'], summary: 'API and database health', security: [] } },
    async (request, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return { status: 'ok', db: 'ok' };
      } catch (error) {
        request.log.error({ err: error }, 'Database health check failed');
        return reply.status(503).send({ status: 'error', db: 'error' });
      }
    },
  );
};
