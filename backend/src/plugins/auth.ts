import type { FastifyReply, FastifyRequest } from 'fastify';
import { unauthorized } from '../errors.js';
import { hashApiToken, isApiToken } from '../lib/api-token.js';
import { prisma } from '../lib/prisma.js';

export type AuthContext = {
  userId: string;
  /**
   * Whose board memberships apply to this request. Same as userId, except for agent tokens:
   * an agent acts with the access of the human who minted its token.
   */
  accessUserId: string;
  method: 'jwt' | 'api_token';
  apiTokenId?: string;
};

export type JwtPayload = { sub: string };

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
  }
}

/** onRequest hook: accepts `Bearer <jwt>` or `Bearer fb_<api token>`. */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  const match = header?.match(/^Bearer\s+(\S+)$/i);
  const token = match?.[1];
  if (!token) throw unauthorized('Missing or malformed Authorization header');

  if (isApiToken(token)) {
    const apiToken = await prisma.apiToken.findUnique({
      where: { tokenHash: hashApiToken(token) },
    });
    if (!apiToken) throw unauthorized('Invalid API token');
    await prisma.apiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } });
    request.auth = {
      userId: apiToken.userId,
      accessUserId: apiToken.createdById ?? apiToken.userId,
      method: 'api_token',
      apiTokenId: apiToken.id,
    };
    return;
  }

  let payload: JwtPayload;
  try {
    payload = request.server.jwt.verify<JwtPayload>(token);
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } });
  if (!user) throw unauthorized('Invalid or expired token');
  request.auth = { userId: user.id, accessUserId: user.id, method: 'jwt' };
}
