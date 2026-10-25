import { conflict, forbidden, notFound, unauthorized } from '../errors.js';
import { generateApiToken, hashApiToken } from '../lib/api-token.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { publicUserSelect } from '../schemas/common.js';

export async function registerUser(data: { name: string; email: string; password: string }) {
  const email = data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict('Email is already registered', 'EMAIL_TAKEN');
  return prisma.user.create({
    data: { name: data.name, email, passwordHash: await hashPassword(data.password) },
    select: publicUserSelect,
  });
}

export async function authenticateUser(emailInput: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: emailInput.toLowerCase() } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized('Invalid email or password');
  }
  const { passwordHash: _passwordHash, ...publicUser } = user;
  return publicUser;
}

export async function getUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) throw notFound('User');
  return user;
}

/** People who share a board with the user, plus agents (they can be assigned anywhere). */
export function listUsers(accessUserId: string) {
  return prisma.user.findMany({
    where: {
      OR: [
        { type: 'agent' },
        { boardMemberships: { some: { board: { members: { some: { userId: accessUserId } } } } } },
        { id: accessUserId },
      ],
    },
    select: publicUserSelect,
    orderBy: { name: 'asc' },
  });
}

const apiTokenSelect = {
  id: true,
  name: true,
  lastUsedAt: true,
  createdAt: true,
  user: { select: { id: true, name: true, type: true } },
} as const;

/**
 * Tokens can belong to the requester or — when the requester is human — to an agent user
 * (agents can't log in, so humans mint and revoke their tokens). An agent token acts with the
 * board access of the human who created it, so each human only sees the agent tokens they made.
 */
async function assertCanManageTokensOf(requesterId: string, ownerId: string) {
  if (requesterId === ownerId) return;
  const [requester, owner] = await Promise.all([
    prisma.user.findUnique({ where: { id: requesterId }, select: { type: true } }),
    prisma.user.findUnique({ where: { id: ownerId }, select: { type: true } }),
  ]);
  if (!owner) throw notFound('User');
  if (requester?.type !== 'human' || owner.type !== 'agent') {
    throw forbidden("You can only manage your own tokens or an agent's tokens");
  }
}

async function isAgent(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { type: true } });
  return user?.type === 'agent';
}

export async function listApiTokens(
  requesterId: string,
  accessUserId: string,
  ownerId = requesterId,
) {
  await assertCanManageTokensOf(requesterId, ownerId);
  return prisma.apiToken.findMany({
    where: { userId: ownerId, ...((await isAgent(ownerId)) ? { createdById: accessUserId } : {}) },
    select: apiTokenSelect,
    orderBy: { createdAt: 'desc' },
  });
}

/** Returns the plain token; it is never retrievable again. */
export async function createApiToken(
  requesterId: string,
  accessUserId: string,
  name: string,
  ownerId = requesterId,
) {
  await assertCanManageTokensOf(requesterId, ownerId);
  const plainToken = generateApiToken();
  const apiToken = await prisma.apiToken.create({
    data: { userId: ownerId, createdById: accessUserId, name, tokenHash: hashApiToken(plainToken) },
    select: apiTokenSelect,
  });
  return { ...apiToken, token: plainToken };
}

async function findManageableTokenOrThrow(
  requesterId: string,
  accessUserId: string,
  tokenId: string,
) {
  const apiToken = await prisma.apiToken.findUnique({ where: { id: tokenId } });
  if (!apiToken) throw notFound('API token');
  try {
    await assertCanManageTokensOf(requesterId, apiToken.userId);
  } catch {
    // Don't reveal tokens the requester can't manage.
    throw notFound('API token');
  }
  if ((await isAgent(apiToken.userId)) && apiToken.createdById !== accessUserId) {
    throw notFound('API token');
  }
  return apiToken;
}

export async function renameApiToken(
  requesterId: string,
  accessUserId: string,
  tokenId: string,
  name: string,
) {
  await findManageableTokenOrThrow(requesterId, accessUserId, tokenId);
  return prisma.apiToken.update({ where: { id: tokenId }, data: { name }, select: apiTokenSelect });
}

export async function deleteApiToken(requesterId: string, accessUserId: string, tokenId: string) {
  await findManageableTokenOrThrow(requesterId, accessUserId, tokenId);
  await prisma.apiToken.delete({ where: { id: tokenId } });
}
