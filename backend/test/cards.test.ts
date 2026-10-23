import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MIN_POSITION_GAP } from '../src/lib/position.js';
import { prisma } from '../src/lib/prisma.js';
import { createTestApp, registerUser, type TestApp } from './helpers.js';

let app: TestApp;
let headers: { authorization: string };

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  ({ headers } = await registerUser(app));
});

async function api<T = any>(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: object,
) {
  const response = await app.inject({ method, url: `/api${url}`, headers, payload });
  return { status: response.statusCode, body: (response.body ? response.json() : null) as T };
}

async function createBoardWithLists(...titles: string[]) {
  const board = (await api('POST', '/boards', { title: 'Board' })).body;
  const lists = [];
  for (const title of titles)
    lists.push((await api('POST', `/boards/${board.id}/lists`, { title })).body);
  return { board, lists };
}

async function createCards(listId: string, ...titles: string[]) {
  const cards = [];
  for (const title of titles)
    cards.push((await api('POST', `/lists/${listId}/cards`, { title })).body);
  return cards;
}

async function cardTitlesInList(boardId: string, listId: string): Promise<string[]> {
  const board = (await api('GET', `/boards/${boardId}`)).body;
  return board.lists
    .find((list: { id: string }) => list.id === listId)
    .cards.map((card: { title: string }) => card.title);
}

async function activityTypes(boardId: string): Promise<string[]> {
  const activity = await prisma.activity.findMany({
    where: { boardId },
    orderBy: { createdAt: 'asc' },
  });
  return activity.map((item) => item.type);
}

describe('card creation', () => {
  it('appends cards in order and returns them nested in the board', async () => {
    const { board, lists } = await createBoardWithLists('Todo');
    const [a, b, c] = await createCards(lists[0].id, 'A', 'B', 'C');
    expect(a.position).toBeLessThan(b.position);
    expect(b.position).toBeLessThan(c.position);

    const detail = (await api('GET', `/boards/${board.id}`)).body;
    expect(detail.lists).toHaveLength(1);
    expect(detail.lists[0].cards.map((card: { title: string }) => card.title)).toEqual([
      'A',
      'B',
      'C',
    ]);
  });

  it('creates a card at a given position with labels and assignee', async () => {
    const { board, lists } = await createBoardWithLists('Todo');
    await createCards(lists[0].id, 'A', 'B');
    const label = (
      await api('POST', `/boards/${board.id}/labels`, { name: 'bug', color: '#ef4444' })
    ).body;
    const me = (await api('GET', '/auth/me')).body;

    const created = await api('POST', `/lists/${lists[0].id}/cards`, {
      title: 'First',
      description: '# Markdown',
      dueDate: '2026-12-31T12:00:00.000Z',
      assigneeId: me.id,
      labelIds: [label.id],
      index: 0,
    });
    expect(created.status).toBe(201);
    expect(created.body.labels).toEqual([{ id: label.id, name: 'bug', color: '#ef4444' }]);
    expect(created.body.assignee.id).toBe(me.id);
    expect(await cardTitlesInList(board.id, lists[0].id)).toEqual(['First', 'A', 'B']);

    const detail = (await api('GET', `/cards/${created.body.id}`)).body;
    expect(detail).toMatchObject({
      title: 'First',
      description: '# Markdown',
      list: { id: lists[0].id },
    });
  });

  it('rejects labels from another board', async () => {
    const { lists } = await createBoardWithLists('Todo');
    const other = (await api('POST', '/boards', { title: 'Other' })).body;
    const foreign = (
      await api('POST', `/boards/${other.id}/labels`, { name: 'x', color: '#000000' })
    ).body;
    const response = await api('POST', `/lists/${lists[0].id}/cards`, {
      title: 'A',
      labelIds: [foreign.id],
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_LABEL');
  });

  it('records activity for every mutation', async () => {
    const { board, lists } = await createBoardWithLists('Todo', 'Done');
    const [card] = await createCards(lists[0].id, 'A');
    await api('PATCH', `/cards/${card.id}`, { title: 'A2' });
    await api('PATCH', `/cards/${card.id}/move`, { listId: lists[1].id });
    await api('POST', `/cards/${card.id}/comments`, { body: 'hi' });
    await api('POST', `/cards/${card.id}/checklist`, { text: 'step' });
    await api('POST', `/cards/${card.id}/archive`);

    expect(await activityTypes(board.id)).toEqual([
      'board.created',
      'list.created',
      'list.created',
      'card.created',
      'card.updated',
      'card.moved',
      'comment.created',
      'checklist_item.created',
      'card.archived',
    ]);
  });

  it('lists the activity of a single card and exposes checklist progress on the board', async () => {
    const { board, lists } = await createBoardWithLists('Todo');
    const [card, other] = await createCards(lists[0].id, 'A', 'B');
    await api('PATCH', `/cards/${other.id}`, { title: 'B2' });
    const item = (await api('POST', `/cards/${card.id}/checklist`, { text: 'one' })).body;
    await api('POST', `/cards/${card.id}/checklist`, { text: 'two' });
    await api('PATCH', `/checklist-items/${item.id}`, { done: true });

    const activity = (await api('GET', `/cards/${card.id}/activity`)).body;
    expect(activity.items.map((entry: { type: string }) => entry.type)).toEqual([
      'checklist_item.updated',
      'checklist_item.created',
      'checklist_item.created',
      'card.created',
    ]);

    const detail = (await api('GET', `/boards/${board.id}`)).body;
    const tile = detail.lists[0].cards.find((c: { id: string }) => c.id === card.id);
    expect(tile.checklistItems).toHaveLength(2);
    expect(tile.checklistItems.filter((i: { done: boolean }) => i.done)).toHaveLength(1);
  });

  it('returns 404 in the standard format for unknown cards', async () => {
    const response = await api('GET', '/cards/00000000-0000-4000-8000-000000000000');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Card not found' } });
  });
});

describe('card movement', () => {
  it('moves a card before / after a sibling and to an index within the same list', async () => {
    const { board, lists } = await createBoardWithLists('Todo');
    const listId = lists[0].id;
    const [a, b, c, d] = await createCards(listId, 'A', 'B', 'C', 'D');

    await api('PATCH', `/cards/${d.id}/move`, { beforeId: b.id });
    expect(await cardTitlesInList(board.id, listId)).toEqual(['A', 'D', 'B', 'C']);

    await api('PATCH', `/cards/${a.id}/move`, { afterId: c.id });
    expect(await cardTitlesInList(board.id, listId)).toEqual(['D', 'B', 'C', 'A']);

    await api('PATCH', `/cards/${c.id}/move`, { index: 0 });
    expect(await cardTitlesInList(board.id, listId)).toEqual(['C', 'D', 'B', 'A']);

    // No target: end of list
    await api('PATCH', `/cards/${c.id}/move`, {});
    expect(await cardTitlesInList(board.id, listId)).toEqual(['D', 'B', 'A', 'C']);
  });

  it('moves a card to another list and logs from/to in the activity', async () => {
    const { board, lists } = await createBoardWithLists('Todo', 'Doing');
    const [a] = await createCards(lists[0].id, 'A', 'B');
    const [x] = await createCards(lists[1].id, 'X', 'Y');

    const moved = await api('PATCH', `/cards/${a.id}/move`, { listId: lists[1].id, afterId: x.id });
    expect(moved.status).toBe(200);
    expect(moved.body.listId).toBe(lists[1].id);
    expect(await cardTitlesInList(board.id, lists[0].id)).toEqual(['B']);
    expect(await cardTitlesInList(board.id, lists[1].id)).toEqual(['X', 'A', 'Y']);

    const activity = (await api('GET', `/boards/${board.id}/activity?limit=1`)).body;
    expect(activity.items[0]).toMatchObject({
      type: 'card.moved',
      cardId: a.id,
      payload: { fromListId: lists[0].id, toListId: lists[1].id, index: 1 },
    });
  });

  it('rejects a reference card that is not in the target list', async () => {
    const { lists } = await createBoardWithLists('Todo', 'Doing');
    const [a] = await createCards(lists[0].id, 'A');
    const [x] = await createCards(lists[1].id, 'X');
    const response = await api('PATCH', `/cards/${a.id}/move`, {
      listId: lists[0].id,
      beforeId: x.id,
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_MOVE_TARGET');
  });

  it('rejects ambiguous targets', async () => {
    const { lists } = await createBoardWithLists('Todo');
    const [a, b] = await createCards(lists[0].id, 'A', 'B');
    const response = await api('PATCH', `/cards/${a.id}/move`, { beforeId: b.id, index: 0 });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects moving to a list in another board', async () => {
    const { lists } = await createBoardWithLists('Todo');
    const other = await createBoardWithLists('Elsewhere');
    const [a] = await createCards(lists[0].id, 'A');
    const response = await api('PATCH', `/cards/${a.id}/move`, { listId: other.lists[0].id });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CROSS_BOARD_MOVE');
  });

  it('rebalances positions when the gap between neighbours becomes too small', async () => {
    const { board, lists } = await createBoardWithLists('Todo');
    const listId = lists[0].id;
    const [a, b, c] = await createCards(listId, 'A', 'B', 'C');
    await prisma.card.update({ where: { id: a.id }, data: { position: 1 } });
    await prisma.card.update({
      where: { id: b.id },
      data: { position: 1 + MIN_POSITION_GAP / 10 },
    });

    const moved = await api('PATCH', `/cards/${c.id}/move`, { afterId: a.id });
    expect(moved.status).toBe(200);
    expect(await cardTitlesInList(board.id, listId)).toEqual(['A', 'C', 'B']);

    const positions = (
      await prisma.card.findMany({ where: { listId }, orderBy: { position: 'asc' } })
    ).map((card) => card.position);
    expect(positions).toEqual([1024, 1536, 2048]);

    const activity = (await api('GET', `/boards/${board.id}/activity?limit=1`)).body;
    expect(activity.items[0].payload.rebalanced).toBe(true);
  });

  it('keeps order correct across many inserts at the same spot', async () => {
    const { board, lists } = await createBoardWithLists('Todo');
    const listId = lists[0].id;
    const [first] = await createCards(listId, 'first', 'last');
    const expected = ['first', 'last'];
    for (let i = 0; i < 60; i += 1) {
      await api('POST', `/lists/${listId}/cards`, { title: `n${i}`, afterId: first.id });
      expected.splice(1, 0, `n${i}`);
    }
    expect(await cardTitlesInList(board.id, listId)).toEqual(expected);
  });

  it('skips archived cards when computing positions', async () => {
    const { board, lists } = await createBoardWithLists('Todo');
    const listId = lists[0].id;
    const [a, b, c] = await createCards(listId, 'A', 'B', 'C');
    await api('POST', `/cards/${b.id}/archive`);
    await api('PATCH', `/cards/${c.id}/move`, { index: 0 });
    expect(await cardTitlesInList(board.id, listId)).toEqual(['C', 'A']);

    await api('POST', `/cards/${b.id}/restore`);
    expect(await cardTitlesInList(board.id, listId)).toContain('B');
    expect(a.id).toBeDefined();
  });
});

describe('list reordering', () => {
  it('reorders lists with beforeId / afterId / index', async () => {
    const { board, lists } = await createBoardWithLists('Backlog', 'Todo', 'Doing', 'Done');
    const [backlog, todo, , done] = lists;
    const titles = async () =>
      (await api('GET', `/boards/${board.id}`)).body.lists.map(
        (list: { title: string }) => list.title,
      );

    await api('PATCH', `/lists/${done.id}/move`, { beforeId: todo.id });
    expect(await titles()).toEqual(['Backlog', 'Done', 'Todo', 'Doing']);

    await api('PATCH', `/lists/${backlog.id}/move`, { afterId: todo.id });
    expect(await titles()).toEqual(['Done', 'Todo', 'Backlog', 'Doing']);

    await api('PATCH', `/lists/${backlog.id}/move`, { index: 3 });
    expect(await titles()).toEqual(['Done', 'Todo', 'Doing', 'Backlog']);

    expect((await activityTypes(board.id)).filter((type) => type === 'list.moved')).toHaveLength(3);
  });

  it('hides archived lists from the board', async () => {
    const { board, lists } = await createBoardWithLists('A', 'B');
    await api('POST', `/lists/${lists[0].id}/archive`);
    const detail = (await api('GET', `/boards/${board.id}`)).body;
    expect(detail.lists.map((list: { title: string }) => list.title)).toEqual(['B']);
  });
});

describe('search and activity pagination', () => {
  it('finds active cards by title or description, case-insensitively', async () => {
    const { lists } = await createBoardWithLists('Todo');
    await api('POST', `/lists/${lists[0].id}/cards`, { title: 'Fix LOGIN bug' });
    await api('POST', `/lists/${lists[0].id}/cards`, {
      title: 'Other',
      description: 'related to login page',
    });
    const archived = (await api('POST', `/lists/${lists[0].id}/cards`, { title: 'login (old)' }))
      .body;
    await api('POST', `/cards/${archived.id}/archive`);
    await api('POST', `/lists/${lists[0].id}/cards`, { title: 'Unrelated' });

    const results = (await api('GET', '/search?q=login')).body;
    expect(results.map((card: { title: string }) => card.title).sort()).toEqual([
      'Fix LOGIN bug',
      'Other',
    ]);
    expect(results[0].list.board.title).toBe('Board');
  });

  it('paginates activity with a cursor', async () => {
    const { board, lists } = await createBoardWithLists('Todo');
    await createCards(lists[0].id, 'A', 'B', 'C');
    // 1 board + 1 list + 3 cards = 5 activities
    const page1 = (await api('GET', `/boards/${board.id}/activity?limit=2`)).body;
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toEqual(expect.any(String));
    const page2 = (
      await api('GET', `/boards/${board.id}/activity?limit=2&cursor=${page1.nextCursor}`)
    ).body;
    const page3 = (
      await api('GET', `/boards/${board.id}/activity?limit=2&cursor=${page2.nextCursor}`)
    ).body;
    expect(page3.items).toHaveLength(1);
    expect(page3.nextCursor).toBeNull();
    const ids = [...page1.items, ...page2.items, ...page3.items].map(
      (item: { id: string }) => item.id,
    );
    expect(new Set(ids).size).toBe(5);
    expect(page3.items[0].type).toBe('board.created');
  });
});
