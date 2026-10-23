import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../env.js';
import { authenticate } from '../plugins/auth.js';
import { authenticateUser, getUser, registerUser } from '../services/auth.js';

const credentials = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
});

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const signToken = (userId: string) =>
    app.jwt.sign({ sub: userId }, { expiresIn: env.jwtExpiresIn });

  app.post(
    '/auth/register',
    {
      schema: {
        tags: ['auth'],
        summary: 'Create an account and return a JWT',
        security: [],
        body: credentials.extend({ name: z.string().trim().min(1).max(100) }),
      },
    },
    async (request, reply) => {
      const user = await registerUser(request.body);
      return reply.status(201).send({ user, token: signToken(user.id) });
    },
  );

  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Exchange email/password for a JWT',
        security: [],
        body: z.object({ email: z.email(), password: z.string().min(1) }),
      },
    },
    async (request) => {
      const user = await authenticateUser(request.body.email, request.body.password);
      return { user, token: signToken(user.id) };
    },
  );

  app.get(
    '/auth/me',
    { onRequest: authenticate, schema: { tags: ['auth'], summary: 'Current user' } },
    async (request) => ({
      ...(await getUser(request.auth.userId)),
      authMethod: request.auth.method,
    }),
  );
};
