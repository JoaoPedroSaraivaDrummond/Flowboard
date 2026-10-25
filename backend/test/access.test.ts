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

type Headers = { authorization: string };

async function api<T = any>(
  headers: Headers,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) {
  const response = await app.inject({ method, url: `/api${url}`, headers, payload });
  return { status: response.statusCode, body: (response.body ? response.json() : null) as T };
}

/** A board with one list, one card, one label, one comment and one checklist item. */
async function createBoardFixture(headers: Headers) {
  const board = (await api(headers, 'POST', '/boards', { title: 'Private' })).body;
  const list = (await api(headers, 'POST', `/boards/${board.id}/lists`, { title: 'Todo' })).body;
  const card = (await api(headers, 'POST', `/lists/${list.id}/cards`, { title: 'Secret card' }))
    .body;
  const label = (
    await api(headers, 'POST', `/boards/${board.id}/labels`, { name: 'bug', color: '#ff0000' })
  ).body;
  const comment = (await api(headers, 'POST', `/cards/${card.id}/comments`, { body: 'hi' })).body;
  const item = (await api(headers, 'POST', `/cards/${card.id}/checklist`, { text: 'step' })).body;
  return { board, list, card, label, comment, item };
}

async function createAgent(minter: Headers) {
  const agent = await prisma.user.create({
    data: {
      name: `Agent ${Date.now()}`,
      email: `agent-${Date.now()}-${Math.random()}@test.local`,
      passwordHash: '!agent',
      type: 'agent',
    },
  });
  const token = await api(minter, 'POST', '/tokens', { name: 'agent token', userId: agent.id });
  return {
    id: agent.id,
    tokenId: token.body.id,
    headers: { authorization: `Bearer ${token.body.token}` },
  };
}

describe('board isolation', () => {
  it("hides another user's board from listing and search", async () => {
    const owner = await registerUser(app);
    const stranger = await registerUser(app);
    const { board } = await createBoardFixture(owner.headers);

    const boards = await api(stranger.headers, 'GET', '/boards?includeArchived=true');
    expect(boards.body.map((b: { id: string }) => b.id)).not.toContain(board.id);

    const search = await api(stranger.headers, 'GET', '/search?q=Secret');
    expect(search.status).toBe(200);
    expect(search.body).toHaveLength(0);

    const scoped = await api(stranger.headers, 'GET', `/search?q=Secret&boardId=${board.id}`);
    expect(scoped.status).toBe(404);
  });

  it('answers 404 on every route that points to a foreign board', async () => {
    const owner = await registerUser(app);
    const stranger = await registerUser(app);
    const { board, list, card, label, comment, item } = await createBoardFixture(owner.headers);
    const ownList = (
      await api(
        stranger.headers,
        'POST',
        `/boards/${(await api(stranger.headers, 'POST', '/boards', { title: 'Mine' })).body.id}/lists`,
        { title: 'Mine' },
      )
    ).body;

    const attempts: [Parameters<typeof api>[1], string, object?][] = [
      ['GET', `/boards/${board.id}`],
      ['PATCH', `/boards/${board.id}`, { title: 'pwned' }],
      ['POST', `/boards/${board.id}/archive`],
      ['GET', `/boards/${board.id}/activity`],
      ['GET', `/boards/${board.id}/members`],
      ['POST', `/boards/${board.id}/lists`, { title: 'x' }],
      ['POST', `/boards/${board.id}/claim`, { fromListId: list.id, toListId: list.id }],
      ['GET', `/lists/${list.id}`],
      ['PATCH', `/lists/${list.id}`, { title: 'pwned' }],
      ['POST', `/lists/${list.id}/cards`, { title: 'x' }],
      ['GET', `/cards/${card.id}`],
      ['PATCH', `/cards/${card.id}`, { title: 'pwned' }],
      ['POST', `/cards/${card.id}/archive`],
      ['GET', `/cards/${card.id}/comments`],
      ['GET', `/cards/${card.id}/checklist`],
      ['PATCH', `/labels/${label.id}`, { name: 'pwned' }],
      ['DELETE', `/labels/${label.id}`],
      ['PATCH', `/comments/${comment.id}`, { body: 'pwned' }],
      ['PATCH', `/checklist-items/${item.id}`, { done: true }],
      ['DELETE', `/checklist-items/${item.id}`],
      // Ids of the foreign board hidden in the body or in a second param
      ['PATCH', `/cards/${card.id}/move`, { listId: ownList.id }],
    ];
    for (const [method, url, payload] of attempts) {
      const response = await api(stranger.headers, method, url, payload);
      expect({ method, url, status: response.status }).toEqual({ method, url, status: 404 });
    }

    const after = await api(owner.headers, 'GET', `/boards/${board.id}`);
    expect(after.body.title).toBe('Private');
    expect(after.body.archivedAt).toBeNull();
    expect(after.body.labels).toHaveLength(1);
  });

  it("doesn't move a card of your own board into a foreign list", async () => {
    const owner = await registerUser(app);
    const stranger = await registerUser(app);
    const { list } = await createBoardFixture(owner.headers);
    const { card } = await createBoardFixture(stranger.headers);

    const response = await api(stranger.headers, 'PATCH', `/cards/${card.id}/move`, {
      listId: list.id,
    });
    expect(response.status).toBe(404);
  });
});

describe('board members', () => {
  it('gives access to added members and lets them leave', async () => {
    const owner = await registerUser(app);
    const guest = await registerUser(app);
    const { board, card } = await createBoardFixture(owner.headers);

    const added = await api(owner.headers, 'POST', `/boards/${board.id}/members`, {
      email: guest.credentials.email,
    });
    expect(added.status).toBe(201);
    expect(added.body.role).toBe('member');

    expect((await api(guest.headers, 'GET', `/cards/${card.id}`)).status).toBe(200);
    const members = await api(guest.headers, 'GET', `/boards/${board.id}/members`);
    expect(members.body).toHaveLength(2);

    const left = await api(guest.headers, 'DELETE', `/boards/${board.id}/members/${guest.user.id}`);
    expect(left.status).toBe(204);
    expect((await api(guest.headers, 'GET', `/cards/${card.id}`)).status).toBe(404);
  });

  it('only lets owners manage members and keeps the last owner', async () => {
    const owner = await registerUser(app);
    const guest = await registerUser(app);
    const third = await registerUser(app);
    const { board } = await createBoardFixture(owner.headers);
    await api(owner.headers, 'POST', `/boards/${board.id}/members`, {
      email: guest.credentials.email,
    });

    const byMember = await api(guest.headers, 'POST', `/boards/${board.id}/members`, {
      email: third.credentials.email,
    });
    expect(byMember.status).toBe(403);

    const kick = await api(guest.headers, 'DELETE', `/boards/${board.id}/members/${owner.user.id}`);
    expect(kick.status).toBe(403);

    const lastOwner = await api(
      owner.headers,
      'DELETE',
      `/boards/${board.id}/members/${owner.user.id}`,
    );
    expect(lastOwner.status).toBe(400);
    expect(lastOwner.body.error.code).toBe('LAST_OWNER');

    const demoteSelf = await api(owner.headers, 'POST', `/boards/${board.id}/members`, {
      email: owner.credentials.email,
      role: 'member',
    });
    expect(demoteSelf.status).toBe(400);
    expect(demoteSelf.body.error.code).toBe('LAST_OWNER');
  });

  it('only assigns cards to board members', async () => {
    const owner = await registerUser(app);
    const stranger = await registerUser(app);
    const { card } = await createBoardFixture(owner.headers);

    const response = await api(owner.headers, 'PATCH', `/cards/${card.id}`, {
      assigneeId: stranger.user.id,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_ASSIGNEE');
  });

  it('lists only users that share a board, plus agents', async () => {
    const owner = await registerUser(app);
    const guest = await registerUser(app);
    const stranger = await registerUser(app);
    const { board } = await createBoardFixture(owner.headers);
    await api(owner.headers, 'POST', `/boards/${board.id}/members`, {
      email: guest.credentials.email,
    });

    const ids = (await api(owner.headers, 'GET', '/users')).body.map((u: { id: string }) => u.id);
    expect(ids).toContain(guest.user.id);
    expect(ids).toContain(owner.user.id);
    expect(ids).not.toContain(stranger.user.id);
  });
});

describe('agent tokens', () => {
  it('act with the access of the human who minted them', async () => {
    const human = await registerUser(app);
    const stranger = await registerUser(app);
    const { board } = await createBoardFixture(human.headers);
    const foreign = await createBoardFixture(stranger.headers);
    const agent = await createAgent(human.headers);

    expect((await api(agent.headers, 'GET', `/boards/${board.id}`)).status).toBe(200);
    expect((await api(agent.headers, 'GET', `/boards/${foreign.board.id}`)).status).toBe(404);

    const created = await api(agent.headers, 'POST', '/boards', { title: 'By agent' });
    expect(created.body.createdById).toBe(agent.id);
    expect((await api(human.headers, 'GET', `/boards/${created.body.id}`)).status).toBe(200);
  });

  it('are only visible to the human who minted them', async () => {
    const human = await registerUser(app);
    const other = await registerUser(app);
    const agent = await createAgent(human.headers);

    const listed = await api(other.headers, 'GET', `/tokens?userId=${agent.id}`);
    expect(listed.body).toHaveLength(0);
    const revoke = await api(other.headers, 'DELETE', `/tokens/${agent.tokenId}`);
    expect(revoke.status).toBe(404);

    const own = await api(human.headers, 'GET', `/tokens?userId=${agent.id}`);
    expect(own.body).toHaveLength(1);
  });
});
