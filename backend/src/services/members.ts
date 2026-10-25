import { badRequest, notFound } from '../errors.js';
import { prisma } from '../lib/prisma.js';
import { publicUserSelect } from '../schemas/common.js';
import { assertBoardOwner } from './access.js';
import type { Tx } from './activity.js';

const memberSelect = { role: true, createdAt: true, user: { select: publicUserSelect } } as const;

export function listMembers(boardId: string) {
  return prisma.boardMember.findMany({
    where: { boardId },
    select: memberSelect,
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Locks the board row so concurrent role changes and removals are serialized, then returns the
 * member, refusing to take away the last owner (nobody could manage the board afterwards).
 */
async function lockMemberKeepingAnOwner(tx: Tx, boardId: string, userId: string) {
  await tx.$queryRaw`SELECT id FROM "Board" WHERE id = ${boardId}::uuid FOR UPDATE`;
  const member = await tx.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId } },
  });
  if (member?.role === 'owner') {
    const owners = await tx.boardMember.count({ where: { boardId, role: 'owner' } });
    if (owners <= 1) throw badRequest('A board needs at least one owner', 'LAST_OWNER');
  }
  return member;
}

/** Owners add people by e-mail. Agents don't need membership: they act for whoever made their token. */
export async function addMember(
  accessUserId: string,
  boardId: string,
  data: { email: string; role: 'owner' | 'member' },
) {
  await assertBoardOwner(accessUserId, boardId);
  const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
  if (!user) throw notFound('User');
  if (user.type === 'agent') throw badRequest('Agents act through API tokens, not membership');
  return prisma.$transaction(async (tx) => {
    if (data.role === 'member') await lockMemberKeepingAnOwner(tx, boardId, user.id);
    return tx.boardMember.upsert({
      where: { boardId_userId: { boardId, userId: user.id } },
      create: { boardId, userId: user.id, role: data.role },
      update: { role: data.role },
      select: memberSelect,
    });
  });
}

/** Owners remove anyone; members can leave. A board always keeps at least one owner. */
export async function removeMember(accessUserId: string, boardId: string, userId: string) {
  if (userId !== accessUserId) await assertBoardOwner(accessUserId, boardId);
  await prisma.$transaction(async (tx) => {
    const member = await lockMemberKeepingAnOwner(tx, boardId, userId);
    if (!member) throw notFound('Member');
    await tx.boardMember.delete({ where: { boardId_userId: { boardId, userId } } });
  });
}
