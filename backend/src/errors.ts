import { Prisma } from '@prisma/client';
import type { FastifyError, FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST') =>
  new AppError(400, code, message);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You are not allowed to perform this action') =>
  new AppError(403, 'FORBIDDEN', message);
export const notFound = (entity: string) => new AppError(404, 'NOT_FOUND', `${entity} not found`);
export const conflict = (message: string, code = 'CONFLICT') => new AppError(409, code, message);

export type ErrorBody = { error: { code: string; message: string; details?: unknown } };

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((issue) => ({
        path: `${error.validationContext ?? 'request'}${issue.instancePath}`,
        message: issue.message,
      }));
      const body: ErrorBody = {
        error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details },
      };
      return reply.status(400).send(body);
    }

    if (error instanceof AppError) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } } satisfies ErrorBody);
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return reply.status(404).send({
          error: { code: 'NOT_FOUND', message: 'Resource not found' },
        } satisfies ErrorBody);
      }
      // Deadlock / serialization failure between concurrent transactions (e.g. crossed claims).
      if (error.code === 'P2034' || /40P01|40001/.test(String(error.meta?.code ?? error.message))) {
        return reply.status(409).send({
          error: { code: 'CONCURRENT_UPDATE', message: 'Concurrent update conflict, please retry' },
        } satisfies ErrorBody);
      }
      if (error.code === 'P2002') {
        return reply.status(409).send({
          error: { code: 'CONFLICT', message: 'Resource already exists' },
        } satisfies ErrorBody);
      }
    }

    // Fastify's own client errors (malformed JSON, payload too large, ...)
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: { code: error.code ?? 'BAD_REQUEST', message: error.message },
      } satisfies ErrorBody);
    }

    request.log.error({ err: error }, 'Unhandled error');
    return reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    } satisfies ErrorBody);
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    } satisfies ErrorBody);
  });
}
