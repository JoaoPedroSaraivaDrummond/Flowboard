import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { createTestApp, registerUser, type TestApp } from './helpers.js';

let app: TestApp;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('register / login', () => {
  it('registers a user, hashes the password and returns a JWT', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Ada', email: 'Ada@Example.com', password: 'password123' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user).toMatchObject({ name: 'Ada', email: 'ada@example.com' });
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(body.token).toEqual(expect.any(String));

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'ada@example.com' } });
    expect(stored.passwordHash).not.toContain('password123');
  });

  it('rejects a duplicate email with 409', async () => {
    await registerUser(app, { email: 'dup@test.local' });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: 'Again', email: 'dup@test.local', password: 'password123' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: { code: 'EMAIL_TAKEN', message: expect.any(String) },
    });
  });

  it('returns a validation error in the standard format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { name: '', email: 'not-an-email', password: 'short' },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toEqual(expect.any(String));
  });

  it('logs in with valid credentials and rejects invalid ones', async () => {
    const { credentials } = await registerUser(app);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: credentials.email, password: credentials.password },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().token).toEqual(expect.any(String));

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: credentials.email, password: 'wrong-password' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('UNAUTHORIZED');
  });
});

describe('protected routes', () => {
  it('requires a bearer token', async () => {
    const missing = await app.inject({ method: 'GET', url: '/api/boards' });
    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: expect.any(String) },
    });

    const garbage = await app.inject({
      method: 'GET',
      url: '/api/boards',
      headers: { authorization: 'Bearer not-a-jwt' },
    });
    expect(garbage.statusCode).toBe(401);
  });

  it('accepts a JWT', async () => {
    const { headers, user } = await registerUser(app);
    const response = await app.inject({ method: 'GET', url: '/api/auth/me', headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: user.id, authMethod: 'jwt' });
  });
});

describe('API tokens', () => {
  it('shows the plain token only once, stores only its hash, and authenticates with it', async () => {
    const { headers, user } = await registerUser(app);

    const created = await app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers,
      payload: { name: 'Claude Code' },
    });
    expect(created.statusCode).toBe(201);
    const { id, token } = created.json<{ id: string; token: string }>();
    expect(token).toMatch(/^fb_/);

    const stored = await prisma.apiToken.findUniqueOrThrow({ where: { id } });
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).not.toContain(token);
    expect(stored.lastUsedAt).toBeNull();

    const listed = await app.inject({ method: 'GET', url: '/api/tokens', headers });
    expect(listed.json()).toHaveLength(1);
    expect(listed.json()[0]).not.toHaveProperty('token');
    expect(listed.json()[0]).not.toHaveProperty('tokenHash');

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ id: user.id, authMethod: 'api_token' });
    expect((await prisma.apiToken.findUniqueOrThrow({ where: { id } })).lastUsedAt).not.toBeNull();

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/tokens/${id}`,
      headers,
      payload: { name: 'MCP server' },
    });
    expect(renamed.json()).toMatchObject({ id, name: 'MCP server' });

    const revoked = await app.inject({ method: 'DELETE', url: `/api/tokens/${id}`, headers });
    expect(revoked.statusCode).toBe(204);
    const afterRevoke = await app.inject({
      method: 'GET',
      url: '/api/boards',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(afterRevoke.statusCode).toBe(401);
  });

  it("does not let a user manage someone else's token", async () => {
    const owner = await registerUser(app);
    const other = await registerUser(app);
    const created = await app.inject({
      method: 'POST',
      url: '/api/tokens',
      headers: owner.headers,
      payload: { name: 'mine' },
    });
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/tokens/${created.json().id}`,
      headers: other.headers,
    });
    expect(response.statusCode).toBe(404);
  });

  it('rejects an unknown fb_ token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/boards',
      headers: { authorization: 'Bearer fb_doesnotexist' },
    });
    expect(response.statusCode).toBe(401);
  });
});
