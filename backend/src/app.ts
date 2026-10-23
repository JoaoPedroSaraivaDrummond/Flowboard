import fastifyJwt from '@fastify/jwt';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { env } from './env.js';
import { registerErrorHandlers } from './errors.js';
import { authenticate } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { boardRoutes } from './routes/boards.js';
import { cardRoutes } from './routes/cards.js';
import { checklistRoutes } from './routes/checklist.js';
import { commentRoutes } from './routes/comments.js';
import { healthRoutes } from './routes/health.js';
import { labelRoutes } from './routes/labels.js';
import { listRoutes } from './routes/lists.js';
import { searchRoutes } from './routes/search.js';
import { tokenRoutes } from './routes/tokens.js';
import { workflowRoutes } from './routes/workflow.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: env.logLevel } }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandlers(app);

  await app.register(fastifyJwt, { secret: env.jwtSecret });
  app.decorateRequest('auth', null as never);

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Flowboard API',
        description:
          'Authenticate with `Authorization: Bearer <jwt>` (from /api/auth/login) or `Authorization: Bearer fb_<api token>`.',
        version: '0.1.0',
      },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      },
      security: [{ bearerAuth: [] }],
    },
    transform: jsonSchemaTransform,
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/docs' });

  // Health is also exposed at the root for Docker/infra probes.
  await app.register(healthRoutes);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);

      await api.register(async (protectedApi) => {
        protectedApi.addHook('onRequest', authenticate);
        await protectedApi.register(tokenRoutes);
        await protectedApi.register(boardRoutes);
        await protectedApi.register(listRoutes);
        await protectedApi.register(cardRoutes);
        await protectedApi.register(labelRoutes);
        await protectedApi.register(commentRoutes);
        await protectedApi.register(checklistRoutes);
        await protectedApi.register(searchRoutes);
        await protectedApi.register(workflowRoutes);
      });
    },
    { prefix: '/api' },
  );

  return app;
}
