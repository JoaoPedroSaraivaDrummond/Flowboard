import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

export type TestApp = Awaited<ReturnType<typeof buildApp>>;

export async function createTestApp(): Promise<TestApp> {
  const app = await buildApp();
  await app.ready();
  return app;
}

let userCounter = 0;

/** Registers a fresh user and returns its JWT plus an auth header helper. */
export async function registerUser(app: FastifyInstance, overrides: { email?: string } = {}) {
  userCounter += 1;
  const credentials = {
    name: `User ${userCounter}`,
    email: overrides.email ?? `user${userCounter}-${Date.now()}@test.local`,
    password: 'password123',
  };
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: credentials,
  });
  if (response.statusCode !== 201) throw new Error(`register failed: ${response.body}`);
  const body = response.json<{ user: { id: string; email: string }; token: string }>();
  return {
    ...body,
    credentials,
    headers: { authorization: `Bearer ${body.token}` },
  };
}
