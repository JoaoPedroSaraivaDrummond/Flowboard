import type { FastifyReply, FastifyRequest } from 'fastify';
import { badRequest, forbidden, notFound } from '../errors.js';
import { prisma } from '../lib/prisma.js';

/** Prisma filter for boards the user can access. */
export const memberOf = (accessUserId: string) => ({ members: { some: { userId: accessUserId } } });

type BoardScoped =
  'board' | 'list' | 'card' | 'checklistItem' | 'comment' | 'label' | 'customField' | 'template';

const entityNames: Record<BoardScoped, string> = {
  board: 'Board',
  list: 'List',
  card: 'Card',
  checklistItem: 'Checklist item',
  comment: 'Comment',
  label: 'Label',
  customField: 'Custom field',
  template: 'Template',
};

/** Board that owns the resource, or null when the resource doesn't exist. */
async function boardIdOf(kind: BoardScoped, id: string): Promise<string | null> {
  switch (kind) {
    case 'board':
      return (await prisma.board.findUnique({ where: { id }, select: { id: true } }))?.id ?? null;
    case 'list':
      return (
        (await prisma.list.findUnique({ where: { id }, select: { boardId: true } }))?.boardId ??
        null
      );
    case 'card':
      return (
        (
          await prisma.card.findUnique({
            where: { id },
            select: { list: { select: { boardId: true } } },
          })
        )?.list.boardId ?? null
      );
    case 'checklistItem':
      return (
        (
          await prisma.checklistItem.findUnique({
            where: { id },
            select: { card: { select: { list: { select: { boardId: true } } } } },
          })
        )?.card.list.boardId ?? null
      );
    case 'comment':
      return (
        (
          await prisma.comment.findUnique({
            where: { id },
            select: { card: { select: { list: { select: { boardId: true } } } } },
          })
        )?.card.list.boardId ?? null
      );
    case 'label':
      return (
        (await prisma.label.findUnique({ where: { id }, select: { boardId: true } }))?.boardId ??
        null
      );
    case 'customField':
      return (
        (await prisma.customField.findUnique({ where: { id }, select: { boardId: true } }))
          ?.boardId ?? null
      );
    case 'template':
      return (
        (await prisma.cardTemplate.findUnique({ where: { id }, select: { boardId: true } }))
          ?.boardId ?? null
      );
  }
}

export async function getBoardRole(accessUserId: string, boardId: string) {
  const member = await prisma.boardMember.findUnique({
    where: { boardId_userId: { boardId, userId: accessUserId } },
    select: { role: true },
  });
  return member?.role ?? null;
}

/**
 * Resolves the board of a resource and checks membership. Resources on boards the user can't
 * access answer 404, so their existence isn't revealed.
 */
export async function assertAccess(
  accessUserId: string,
  kind: BoardScoped,
  id: string,
): Promise<string> {
  const boardId = await boardIdOf(kind, id);
  if (!boardId || !(await getBoardRole(accessUserId, boardId))) throw notFound(entityNames[kind]);
  return boardId;
}

export async function assertBoardOwner(accessUserId: string, boardId: string) {
  const role = await getBoardRole(accessUserId, boardId);
  if (!role) throw notFound('Board');
  if (role !== 'owner') throw forbidden('Only board owners can manage members');
}

// First path segment of a board-scoped route -> resource kind of its `:id` param.
const routeKinds: Record<string, BoardScoped> = {
  boards: 'board',
  lists: 'list',
  cards: 'card',
  'checklist-items': 'checklistItem',
  comments: 'comment',
  labels: 'label',
  'custom-fields': 'customField',
  templates: 'template',
};

type AnyRecord = Record<string, unknown>;

/**
 * preHandler for every authenticated route. Checks the board behind the `:id` param, the extra
 * ids a route can point to (`:labelId`, `:fieldId`, body `listId`, query `boardId`) and that
 * assignees belong to the board. Same-board rules (labels, cross-board moves) stay in the services.
 */
export async function enforceBoardAccess(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const route = (request.routeOptions.url ?? '').replace(/^\/api/, '');
  const [, segment, param] = route.split('/');
  const params = (request.params ?? {}) as AnyRecord;
  const body = (request.body && typeof request.body === 'object' ? request.body : {}) as AnyRecord;
  const query = (request.query ?? {}) as AnyRecord;
  const { accessUserId } = request.auth;

  let boardId: string | null = null;
  const kind = segment ? routeKinds[segment] : undefined;
  if (kind && param === ':id' && typeof params.id === 'string') {
    boardId = await assertAccess(accessUserId, kind, params.id);
  }

  const extras: [BoardScoped, unknown][] = [
    ['label', params.labelId],
    ['customField', params.fieldId],
    ['list', body.listId],
    ['board', query.boardId],
  ];
  for (const [extraKind, id] of extras) {
    if (typeof id === 'string') await assertAccess(accessUserId, extraKind, id);
  }

  if (boardId) {
    for (const assigneeId of [body.assigneeId, body.onEnterAssigneeId]) {
      if (typeof assigneeId === 'string') await assertAssignable(boardId, assigneeId);
    }
  }
}

/** Assignees must be board members; agents can always be assigned (they act for a member). */
async function assertAssignable(boardId: string, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { type: true, boardMemberships: { where: { boardId }, select: { role: true } } },
  });
  if (!user || (user.type !== 'agent' && user.boardMemberships.length === 0)) {
    throw badRequest('Assignee must be a member of the board', 'INVALID_ASSIGNEE');
  }
}
