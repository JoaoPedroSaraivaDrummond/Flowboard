import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma.js';
import { createTestApp, registerUser, type TestApp } from './helpers.js';

let app: TestApp;
let human: Awaited<ReturnType<typeof registerUser>>;
let agentHeaders: { authorization: string };
let agentId: string;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

/** Creates an agent user and an API token for it, minted by the human (as the UI does). */
async function createAgent(name = 'Claude Agent') {
  const agent = await prisma.user.create({
    data: {
      name,
      email: `${name.replace(/\W/g, '').toLowerCase()}-${Date.now()}@test.local`,
      passwordHash: '!agent',
      type: 'agent',
    },
  });
  const token = await app.inject({
    method: 'POST',
    url: '/api/tokens',
    headers: human.headers,
    payload: { name: 'agent token', userId: agent.id },
  });
  expect(token.statusCode).toBe(201);
  return { id: agent.id, headers: { authorization: `Bearer ${token.json().token}` } };
}

beforeEach(async () => {
  human = await registerUser(app);
  ({ id: agentId, headers: agentHeaders } = await createAgent());
});

type Headers = { authorization: string };
type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function api<T = any>(
  method: Method,
  url: string,
  payload?: object,
  headers: Headers = human.headers,
) {
  const response = await app.inject({ method, url: `/api${url}`, headers, payload });
  return { status: response.statusCode, body: (response.body ? response.json() : null) as T };
}

async function setupBoard(...titles: string[]) {
  const board = (await api('POST', '/boards', { title: 'Board' })).body;
  const lists: Record<string, string> = {};
  for (const title of titles)
    lists[title] = (await api('POST', `/boards/${board.id}/lists`, { title })).body.id;
  return { boardId: board.id as string, lists };
}

async function createCards(listId: string, count: number) {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    ids.push((await api('POST', `/lists/${listId}/cards`, { title: `card ${i}` })).body.id);
  }
  return ids;
}

const claim = (boardId: string, fromListId: string, toListId: string, headers = agentHeaders) =>
  api('POST', `/boards/${boardId}/claim`, { fromListId, toListId }, headers);

describe('claim_next_card (atomic claim)', () => {
  it('takes the top card, assigns it to the caller, moves it to the end and logs card.claimed', async () => {
    const { boardId, lists } = await setupBoard('Todo', 'Doing');
    const [first, second] = await createCards(lists.Todo!, 2);
    const [existing] = await createCards(lists.Doing!, 1);

    const response = await claim(boardId, lists.Todo!, lists.Doing!);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: first, listId: lists.Doing, assigneeId: agentId });
    expect(response.body.checklistItems).toEqual([]); // full card detail

    const doing = await prisma.card.findMany({
      where: { listId: lists.Doing },
      orderBy: { position: 'asc' },
    });
    expect(doing.map((c) => c.id)).toEqual([existing, first]);
    expect((await prisma.card.findUniqueOrThrow({ where: { id: second } })).listId).toBe(
      lists.Todo,
    );

    const activity = await prisma.activity.findFirstOrThrow({
      where: { cardId: first, type: 'card.claimed' },
      include: { actor: true },
    });
    expect(activity.actor).toMatchObject({ id: agentId, type: 'agent' });
    expect(activity.payload).toMatchObject({ fromListId: lists.Todo, toListId: lists.Doing });
  });

  it('never hands the same card to two concurrent claimers', async () => {
    const { boardId, lists } = await setupBoard('Todo', 'Doing');
    const cards = await createCards(lists.Todo!, 5);
    const agents = [{ id: agentId, headers: agentHeaders }];
    for (let i = 1; i < 8; i += 1) agents.push(await createAgent(`Agent ${i}`));

    // 8 agents race for 5 cards.
    const results = await Promise.all(
      agents.map((agent) => claim(boardId, lists.Todo!, lists.Doing!, agent.headers)),
    );

    const succeeded = results.filter((r) => r.status === 200);
    const failed = results.filter((r) => r.status !== 200);
    expect(succeeded).toHaveLength(5);
    expect(failed.map((r) => r.body.error.code)).toEqual(Array(3).fill('NO_CARD_TO_CLAIM'));

    const claimedIds = succeeded.map((r) => r.body.id);
    expect(new Set(claimedIds).size).toBe(5);
    expect([...claimedIds].sort()).toEqual([...cards].sort());

    // Each card ended up assigned to the agent whose claim returned it, exactly once.
    for (const [index, result] of results.entries()) {
      if (result.status !== 200) continue;
      const card = await prisma.card.findUniqueOrThrow({ where: { id: result.body.id } });
      expect(card).toMatchObject({ listId: lists.Doing, assigneeId: agents[index]!.id });
    }
    expect(await prisma.activity.count({ where: { type: 'card.claimed' } })).toBe(5);
    expect(await prisma.card.count({ where: { listId: lists.Todo } })).toBe(0);
  });

  it('respects the target WIP limit under concurrency', async () => {
    const { boardId, lists } = await setupBoard('Todo', 'Doing');
    await createCards(lists.Todo!, 6);
    await api('PATCH', `/lists/${lists.Doing}`, { wipLimit: 2 });

    const results = await Promise.all(
      Array.from({ length: 6 }, () => claim(boardId, lists.Todo!, lists.Doing!)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(2);
    const rejected = results.filter((r) => r.status === 409);
    expect(rejected).toHaveLength(4);
    expect(rejected[0]!.body.error).toMatchObject({ code: 'WIP_LIMIT_REACHED' });
    expect(await prisma.card.count({ where: { listId: lists.Doing, archivedAt: null } })).toBe(2);
    expect(await prisma.card.count({ where: { listId: lists.Todo } })).toBe(4);
  });

  it('serializes concurrent claims from different source lists into one WIP-limited list', async () => {
    const { boardId, lists } = await setupBoard('A', 'B', 'Doing');
    await createCards(lists.A!, 3);
    await createCards(lists.B!, 3);
    await api('PATCH', `/lists/${lists.Doing}`, { wipLimit: 3 });

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        claim(boardId, i % 2 ? lists.A! : lists.B!, lists.Doing!),
      ),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(3);
    expect(await prisma.card.count({ where: { listId: lists.Doing } })).toBe(3);
  });

  it('validates the lists', async () => {
    const { boardId, lists } = await setupBoard('Todo', 'Doing');
    const other = await setupBoard('Elsewhere');
    expect((await claim(boardId, lists.Todo!, lists.Todo!)).body.error.code).toBe('INVALID_LIST');
    expect((await claim(boardId, lists.Todo!, other.lists.Elsewhere!)).body.error.code).toBe(
      'INVALID_LIST',
    );
    const empty = await claim(boardId, lists.Todo!, lists.Doing!);
    expect(empty.status).toBe(404);
    expect(empty.body.error).toEqual({
      code: 'NO_CARD_TO_CLAIM',
      message: 'List "Todo" has no cards to claim',
    });
  });
});

describe('list rules', () => {
  it('blocks moves and creations beyond the WIP limit with a clear error', async () => {
    const { lists } = await setupBoard('Todo', 'Doing');
    const [a, b, c] = await createCards(lists.Todo!, 3);
    await api('PATCH', `/lists/${lists.Doing}`, { wipLimit: 2 });
    await api('PATCH', `/cards/${a}/move`, { listId: lists.Doing });
    await api('PATCH', `/cards/${b}/move`, { listId: lists.Doing });

    const blocked = await api('PATCH', `/cards/${c}/move`, { listId: lists.Doing });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toEqual({
      code: 'WIP_LIMIT_REACHED',
      message: 'List "Doing" is at its WIP limit (2/2). Finish or move a card out of it first.',
    });
    expect((await api('POST', `/lists/${lists.Doing}/cards`, { title: 'x' })).body.error.code).toBe(
      'WIP_LIMIT_REACHED',
    );

    // Reordering inside a full list is still allowed.
    expect((await api('PATCH', `/cards/${b}/move`, { index: 0 })).status).toBe(200);
    // Archiving frees a slot; restoring into a full list is blocked.
    await api('POST', `/cards/${a}/archive`);
    expect((await api('PATCH', `/cards/${c}/move`, { listId: lists.Doing })).status).toBe(200);
    expect((await api('POST', `/cards/${a}/restore`)).body.error.code).toBe('WIP_LIMIT_REACHED');

    await api('PATCH', `/lists/${lists.Doing}`, { wipLimit: null });
    expect((await api('POST', `/cards/${a}/restore`)).status).toBe(200);
  });

  it('applies on-enter automations (mark done, assign, label) on move and creation', async () => {
    const { boardId, lists } = await setupBoard('Todo', 'Done');
    const label = (
      await api('POST', `/boards/${boardId}/labels`, { name: 'shipped', color: '#22c55e' })
    ).body;
    const update = await api('PATCH', `/lists/${lists.Done}`, {
      onEnterMarkDone: true,
      onEnterAssigneeId: human.user.id,
      onEnterLabelId: label.id,
    });
    expect(update.body).toMatchObject({ onEnterMarkDone: true, onEnterAssigneeId: human.user.id });

    const [card] = await createCards(lists.Todo!, 1);
    const moved = (await api('PATCH', `/cards/${card}/move`, { listId: lists.Done })).body;
    expect(moved.completedAt).toEqual(expect.any(String));
    expect(moved.assigneeId).toBe(human.user.id);
    expect(moved.labels.map((l: { name: string }) => l.name)).toEqual(['shipped']);
    const activity = await prisma.activity.findFirstOrThrow({
      where: { cardId: card, type: 'card.moved' },
    });
    expect(activity.payload).toMatchObject({
      automations: { assigneeId: human.user.id, labelId: label.id, markedDone: true },
    });

    // Creating directly in the list also triggers them; an explicit assignee wins.
    const created = (
      await api('POST', `/lists/${lists.Done}/cards`, { title: 'direct', assigneeId: agentId })
    ).body;
    expect(created).toMatchObject({ assigneeId: agentId, completedAt: expect.any(String) });

    // Reordering within the list does not re-run automations; completion can be toggled manually.
    expect(
      (await api('PATCH', `/cards/${card}`, { completed: false })).body.completedAt,
    ).toBeNull();
    expect((await api('PATCH', `/cards/${card}/move`, { index: 0 })).body.completedAt).toBeNull();
  });

  it('rejects a label from another board as automation', async () => {
    const { lists } = await setupBoard('Todo');
    const other = await setupBoard('X');
    const label = (
      await api('POST', `/boards/${other.boardId}/labels`, { name: 'x', color: '#000000' })
    ).body;
    expect(
      (await api('PATCH', `/lists/${lists.Todo}`, { onEnterLabelId: label.id })).body.error.code,
    ).toBe('INVALID_LABEL');
  });
});

describe('custom fields', () => {
  it('validates and normalizes values by type and exposes them on the board', async () => {
    const { boardId, lists } = await setupBoard('Todo');
    const create = (body: object) => api('POST', `/boards/${boardId}/custom-fields`, body);
    const pr = (await create({ name: 'PR', type: 'url' })).body;
    const priority = (
      await create({ name: 'Prioridade', type: 'select', options: ['alta', 'baixa'] })
    ).body;
    const estimate = (await create({ name: 'Estimativa', type: 'number' })).body;
    expect((await create({ name: 'pr', type: 'text' })).status).toBe(409);
    expect((await create({ name: 'Empty', type: 'select' })).body.error.code).toBe(
      'INVALID_CUSTOM_FIELD',
    );

    const [card] = await createCards(lists.Todo!, 1);
    const set = (fieldId: string, value: unknown) =>
      api('PUT', `/cards/${card}/custom-fields/${fieldId}`, { value });

    expect((await set(pr.id, 'https://github.com/acme/app/pull/12')).body).toMatchObject({
      name: 'PR',
      value: 'https://github.com/acme/app/pull/12',
    });
    expect((await set(pr.id, 'not a url')).body.error).toMatchObject({
      code: 'INVALID_CUSTOM_FIELD_VALUE',
    });
    expect((await set(priority.id, 'ALTA')).body.value).toBe('alta');
    expect((await set(priority.id, 'urgente')).body.error.message).toContain(
      'expected one of: alta, baixa',
    );
    expect((await set(estimate.id, '2,5')).body.value).toBe('2.5');
    expect((await set(estimate.id, 'abc')).status).toBe(400);

    const board = (await api('GET', `/boards/${boardId}`)).body;
    expect(board.customFields.map((f: { name: string }) => f.name)).toEqual([
      'PR',
      'Prioridade',
      'Estimativa',
    ]);
    expect(board.lists[0].cards[0].customFieldValues).toHaveLength(3);

    expect((await set(estimate.id, null)).body.value).toBeNull();
    const detail = (await api('GET', `/cards/${card}`)).body;
    expect(detail.customFieldValues.map((v: { fieldId: string }) => v.fieldId).sort()).toEqual(
      [pr.id, priority.id].sort(),
    );
  });
});

describe('card templates', () => {
  it('creates cards with the template description and checklist', async () => {
    const { boardId, lists } = await setupBoard('Todo');
    const template = (
      await api('POST', `/boards/${boardId}/templates`, {
        name: 'Bug',
        description: '## Passos',
        checklist: ['Reproduzir', ' ', 'Corrigir'],
      })
    ).body;
    expect(template.checklist).toEqual(['Reproduzir', 'Corrigir']);

    const card = (
      await api('POST', `/lists/${lists.Todo}/cards/from-template`, {
        templateId: template.id,
        title: 'Login quebrado',
      })
    ).body;
    const detail = (await api('GET', `/cards/${card.id}`)).body;
    expect(detail).toMatchObject({ title: 'Login quebrado', description: '## Passos' });
    expect(detail.checklistItems.map((i: { text: string }) => i.text)).toEqual([
      'Reproduzir',
      'Corrigir',
    ]);

    const defaultTitle = (
      await api('POST', `/lists/${lists.Todo}/cards/from-template`, { templateId: template.id })
    ).body;
    expect(defaultTitle.title).toBe('Bug');

    const other = await setupBoard('X');
    const foreign = await api('POST', `/lists/${other.lists.X}/cards/from-template`, {
      templateId: template.id,
    });
    expect(foreign.body.error.code).toBe('INVALID_TEMPLATE');
  });
});

describe('agent users and tokens', () => {
  it('humans mint agent tokens; agents act as themselves and are flagged as agents', async () => {
    const me = (await api('GET', '/auth/me', undefined, agentHeaders)).body;
    expect(me).toMatchObject({ id: agentId, type: 'agent', authMethod: 'api_token' });
    expect(human.user).toMatchObject({ type: 'human' });

    const listed = (await api('GET', `/tokens?userId=${agentId}`)).body;
    expect(listed).toHaveLength(1);
    expect(listed[0].user).toMatchObject({ id: agentId, type: 'agent' });

    const { boardId } = await setupBoard('Todo');
    const activity = (await api('GET', `/boards/${boardId}/activity?limit=1`)).body.items[0];
    expect(activity.actor).toMatchObject({ type: 'human' });
  });

  it('agents cannot mint tokens for others, and humans cannot mint for other humans', async () => {
    const other = await registerUser(app);
    expect((await api('POST', '/tokens', { name: 'x', userId: other.user.id })).status).toBe(403);
    expect(
      (await api('POST', '/tokens', { name: 'x', userId: other.user.id }, agentHeaders)).status,
    ).toBe(403);
    const second = await createAgent('Other Agent');
    expect(
      (await api('POST', '/tokens', { name: 'x', userId: second.id }, agentHeaders)).status,
    ).toBe(403);
    // An agent may still manage its own tokens.
    expect((await api('POST', '/tokens', { name: 'self' }, agentHeaders)).status).toBe(201);
  });

  it('agents cannot log in with a password', async () => {
    const agent = await prisma.user.findUniqueOrThrow({ where: { id: agentId } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: agent.email, password: '!agent' },
    });
    expect(response.statusCode).toBe(401);
  });
});
