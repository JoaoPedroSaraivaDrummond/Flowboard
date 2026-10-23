import { afterEach, describe, expect, it } from 'vitest';
import { cardDetail, connect, FakeApi, ids, seededApi, users } from './fake-api.js';

let session: Awaited<ReturnType<typeof connect>> | undefined;
afterEach(async () => {
  await session?.close();
  session = undefined;
});

async function open(api: FakeApi, token?: string | null) {
  session = await connect(api, token);
  return session;
}

describe('tool registry', () => {
  it('exposes the expected tools and no deletion tool', async () => {
    const { client } = await open(seededApi());
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual(
      [
        'add_checklist_item',
        'add_comment',
        'claim_next_card',
        'create_card',
        'create_card_from_template',
        'create_list',
        'get_board',
        'get_board_activity',
        'get_card',
        'list_boards',
        'move_card',
        'search_cards',
        'set_custom_field',
        'toggle_checklist_item',
        'update_card',
      ].sort(),
    );
    expect(names.some((name) => /delete|remove|destroy/.test(name))).toBe(false);
    for (const tool of tools) {
      expect(tool.description?.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe('object');
    }
    const move = tools.find((tool) => tool.name === 'move_card')!;
    expect(move.inputSchema.required).toEqual(['cardId', 'list']);
  });
});

describe('read tools', () => {
  it('list_boards renders one line per board with ids', async () => {
    const { call } = await open(seededApi());
    const { text, isError } = await call('list_boards');
    expect(isError).toBe(false);
    expect(text).toBe(
      `- Fluxo de Desenvolvimento [board:${ids.board}] — Board de exemplo\n` +
        '- Marketing [board:11111111-1111-4111-8111-111111111112]',
    );
  });

  it('get_board accepts a board title and renders lists and compact card lines', async () => {
    const api = seededApi();
    const { call } = await open(api);
    const { text } = await call('get_board', { boardId: 'fluxo de desenvolvimento' });
    expect(api.calls.map((c) => c.path).sort()).toEqual(
      ['/boards?includeArchived=false', `/boards/${ids.board}`, '/users'].sort(),
    );
    expect(text).toContain(`# Fluxo de Desenvolvimento [board:${ids.board}]`);
    expect(text).toContain('Labels: bug, feature');
    expect(text).toContain('Custom fields: PR (url), Prioridade (select: alta|média|baixa)');
    expect(text).toContain('Templates: Bug');
    expect(text).toContain(`## Em Progresso [list:${ids.progress}] (1/1 WIP FULL)`);
    expect(text).toContain('On enter: mark done, assign @Admin');
    expect(text).toContain('· Prioridade=alta');
    expect(text).toContain(`- Criar interface [card:${ids.cardB}]`);
    expect(text).toContain(
      `- Configurar servidor MCP [card:${ids.cardA}] · #feature · due 2099-12-2`,
    );
    expect(text).toContain('@Admin · checklist 1/2 · 2 comments');
    expect(text).toMatch(/## Revisão \[list:[^\]]+\] \(0\)\nOn enter: [^\n]+\n\(empty\)/);
  });

  it('get_card includes description, checklist with item ids and comments', async () => {
    const { call } = await open(seededApi());
    const { text } = await call('get_card', { cardId: ids.cardA });
    expect(text).toContain('PR: https://github.com/acme/app/pull/7');
    expect(text).toContain('## Description\nExpor quadros via **MCP**.');
    expect(text).toContain('## Checklist (1/2)');
    expect(text).toContain(`- [x] Definir ferramentas [item:${ids.item}]`);
    expect(text).toContain('- [ ] Testes');
    expect(text).toMatch(/## Comments \(1\)\n- Admin, 2026-10-21 \d\d:\d\d: Começando hoje/);
  });

  it('search_cards passes query/board and reports no results clearly', async () => {
    const api = seededApi().on('GET /search', () => []);
    const { call } = await open(api);
    const { text } = await call('search_cards', { query: 'login', boardId: ids.board });
    expect(text).toBe('No cards match "login".');
    expect(api.calls.at(-1)!.path).toBe(`/search?q=login&limit=20&boardId=${ids.board}`);
  });

  it('get_board_activity resolves list and card names', async () => {
    const api = seededApi().on('GET /boards/:id/activity', () => ({
      nextCursor: null,
      items: [
        {
          id: 'a1',
          cardId: ids.cardB,
          type: 'card.moved',
          payload: { fromListId: ids.backlog, toListId: ids.progress },
          createdAt: '2026-10-21T12:30:00.000Z',
          actor: { id: ids.admin, name: 'Admin' },
        },
        {
          id: 'a2',
          cardId: ids.cardA,
          type: 'checklist_item.updated',
          payload: { changes: { done: true } },
          createdAt: '2026-10-21T12:00:00.000Z',
          actor: { id: ids.admin, name: 'Claude' },
        },
      ],
    }));
    const { call } = await open(api);
    const { text } = await call('get_board_activity', { boardId: ids.board, limit: 5 });
    expect(api.calls.some((c) => c.path === `/boards/${ids.board}/activity?limit=5`)).toBe(true);
    expect(text).toMatch(/Admin moved card "Criar interface" "Backlog" → "Em Progresso"/);
    expect(text).toMatch(/Claude checked a checklist item on "Configurar servidor MCP"/);
  });
});

describe('move_card', () => {
  it('resolves the list by name ignoring case and accents, and moves to the top', async () => {
    const api = seededApi().on('PATCH /cards/:id/move', () => ({}));
    const { call } = await open(api);
    const { text, isError } = await call('move_card', {
      cardId: ids.cardA,
      list: '  revisao ',
      position: 'top',
    });
    expect(isError).toBe(false);
    expect(api.writes()).toEqual([
      { method: 'PATCH', path: `/cards/${ids.cardA}/move`, body: { listId: ids.review, index: 0 } },
    ]);
    expect(text).toBe('Moved "Configurar servidor MCP" from "Backlog" to "Revisão" (top).');
  });

  it('accepts a list id and defaults to the bottom', async () => {
    const api = seededApi().on('PATCH /cards/:id/move', () => ({}));
    const { call } = await open(api);
    await call('move_card', { cardId: ids.cardA, list: ids.progress });
    expect(api.writes()[0]!.body).toEqual({ listId: ids.progress });
  });

  it('reports unknown list names with the available options and does not write', async () => {
    const api = seededApi();
    const { call } = await open(api);
    const { text, isError } = await call('move_card', { cardId: ids.cardA, list: 'Done' });
    expect(isError).toBe(true);
    expect(text).toBe(
      'Error: No list on this board matches "Done". Available: "Backlog", "Em Progresso", "Revisão".',
    );
    expect(api.writes()).toEqual([]);
  });
});

describe('write tools', () => {
  it('create_card converts a date, places at top and attaches labels by name', async () => {
    const created = cardDetail({ id: ids.cardB, title: 'Nova tarefa', labels: [] });
    const api = seededApi()
      .on('POST /lists/:id/cards', () => ({ id: ids.cardB }))
      .on('GET /cards/:id', () => created)
      .on('PUT /cards/:id/labels/:labelId', () => ({}));
    const { call } = await open(api);
    const { text, isError } = await call('create_card', {
      listId: ids.backlog,
      title: 'Nova tarefa',
      description: '## Contexto',
      labels: ['BUG'],
      dueDate: '2026-11-30',
      position: 'top',
    });
    expect(isError).toBe(false);
    const [create, attach] = api.writes();
    expect(create!.path).toBe(`/lists/${ids.backlog}/cards`);
    expect(create!.body).toEqual({
      title: 'Nova tarefa',
      description: '## Contexto',
      dueDate: new Date('2026-11-30T23:59:59').toISOString(),
      index: 0,
    });
    expect(attach).toEqual({ method: 'PUT', path: `/cards/${ids.cardB}/labels/${ids.bug}` });
    expect(text).toMatch(/^Created in "Backlog":\n- Nova tarefa \[card:/);
  });

  it('create_card reports unknown labels after creating the card', async () => {
    const api = seededApi()
      .on('POST /lists/:id/cards', () => ({ id: ids.cardB }))
      .on('GET /cards/:id', () => cardDetail({ id: ids.cardB, title: 'X', labels: [] }));
    const { call } = await open(api);
    const { text, isError } = await call('create_card', {
      listId: ids.backlog,
      title: 'X',
      labels: ['urgent'],
    });
    expect(isError).toBe(true);
    expect(text).toContain(`Card "X" [card:${ids.cardB}] was created, but labels were not applied`);
    expect(text).toContain('Available: "bug", "feature"');
  });

  it('update_card patches fields, resolves assignee, diffs labels and archives', async () => {
    const api = seededApi()
      .on('PATCH /cards/:id', () => ({}))
      .on('PUT /cards/:id/labels/:labelId', () => ({}))
      .on('DELETE /cards/:id/labels/:labelId', () => ({}))
      .on('POST /cards/:id/archive', () => ({}));
    const { call } = await open(api);
    const { text, isError } = await call('update_card', {
      cardId: ids.cardA,
      title: 'Novo título',
      dueDate: null,
      assignee: 'ana souza',
      labels: ['bug'],
      archived: true,
    });
    expect(isError).toBe(false);
    expect(api.writes()).toEqual([
      {
        method: 'PATCH',
        path: `/cards/${ids.cardA}`,
        body: { title: 'Novo título', dueDate: null, assigneeId: ids.ana },
      },
      { method: 'PUT', path: `/cards/${ids.cardA}/labels/${ids.bug}` },
      { method: 'DELETE', path: `/cards/${ids.cardA}/labels/${ids.feature}` },
      { method: 'POST', path: `/cards/${ids.cardA}/archive` },
    ]);
    expect(text).toMatch(/^Updated title, dueDate, assignee, labels \(\+bug -feature\), archived:/);
  });

  it('update_card without fields is rejected without calling the API', async () => {
    const api = seededApi();
    const { call } = await open(api);
    const { text, isError } = await call('update_card', { cardId: ids.cardA });
    expect(isError).toBe(true);
    expect(text).toBe('Error: Nothing to update: pass at least one field.');
    expect(api.calls).toEqual([]);
  });

  it('toggle_checklist_item, add_checklist_item, add_comment and create_list', async () => {
    const api = seededApi()
      .on('PATCH /checklist-items/:id', (c) => ({
        id: ids.item,
        text: 'Testes',
        ...(c.body as object),
      }))
      .on('POST /cards/:id/checklist', (c) => ({
        id: ids.item,
        ...(c.body as object),
        done: false,
      }))
      .on('POST /cards/:id/comments', () => ({ id: 'c1' }))
      .on('POST /boards/:id/lists', (c) => ({
        id: 'l1',
        boardId: ids.board,
        ...(c.body as object),
      }));
    const { call } = await open(api);

    expect((await call('toggle_checklist_item', { itemId: ids.item, done: true })).text).toBe(
      'Checklist item "Testes" marked done.',
    );
    expect((await call('add_checklist_item', { cardId: ids.cardA, text: 'Docs' })).text).toBe(
      `Added checklist item "Docs" [item:${ids.item}] to [card:${ids.cardA}].`,
    );
    expect((await call('add_comment', { cardId: ids.cardA, body: 'Feito ✅' })).text).toBe(
      `Comment added [comment:c1] to [card:${ids.cardA}].`,
    );
    expect(
      (await call('create_list', { boardId: 'Fluxo de Desenvolvimento', title: 'QA' })).text,
    ).toBe(`Created list "QA" [list:l1] on [board:${ids.board}].`);
    expect(api.writes().map((w) => [w.method, w.path, w.body])).toEqual([
      ['PATCH', `/checklist-items/${ids.item}`, { done: true }],
      ['POST', `/cards/${ids.cardA}/checklist`, { text: 'Docs' }],
      ['POST', `/cards/${ids.cardA}/comments`, { body: 'Feito ✅' }],
      ['POST', `/boards/${ids.board}/lists`, { title: 'QA' }],
    ]);
  });
});

describe('agent workflow tools', () => {
  it('claim_next_card resolves list names and returns the claimed card', async () => {
    const api = seededApi().on('POST /boards/:id/claim', () =>
      cardDetail({
        assignee: users[2]!,
        list: { id: ids.progress, title: 'Em Progresso', boardId: ids.board },
      }),
    );
    const { call } = await open(api);
    const { text, isError } = await call('claim_next_card', {
      boardId: 'Fluxo de Desenvolvimento',
      fromList: 'backlog',
      toList: 'EM PROGRESSO',
    });
    expect(isError).toBe(false);
    expect(api.writes()).toEqual([
      {
        method: 'POST',
        path: `/boards/${ids.board}/claim`,
        body: { fromListId: ids.backlog, toListId: ids.progress },
      },
    ]);
    expect(text).toMatch(/^Claimed from "Backlog" → "Em Progresso", assigned to Claude Agent\./);
    expect(text).toContain('## Checklist (1/2)');
  });

  it('claim_next_card surfaces empty-list and WIP errors from the API', async () => {
    const api = seededApi().on('POST /boards/:id/claim', () => ({
      status: 409,
      json: {
        error: {
          code: 'WIP_LIMIT_REACHED',
          message: 'List "Em Progresso" is at its WIP limit (1/1).',
        },
      },
    }));
    const { call } = await open(api);
    const { text, isError } = await call('claim_next_card', {
      boardId: ids.board,
      fromList: 'Backlog',
      toList: 'Em Progresso',
    });
    expect(isError).toBe(true);
    expect(text).toBe(
      'Error: Flowboard API error 409 WIP_LIMIT_REACHED: List "Em Progresso" is at its WIP limit (1/1).',
    );
  });

  it('set_custom_field resolves the field by name and sends the raw value', async () => {
    const api = seededApi().on('PUT /cards/:id/custom-fields/:fieldId', (c) => ({
      name: 'Prioridade',
      value: (c.body as { value: unknown }).value === null ? null : 'média',
    }));
    const { call } = await open(api);
    expect(
      (
        await call('set_custom_field', {
          cardId: ids.cardA,
          fieldName: 'prioridade',
          value: 'MEDIA',
        })
      ).text,
    ).toBe('Set Prioridade = média on "Configurar servidor MCP".');
    expect(
      (await call('set_custom_field', { cardId: ids.cardA, fieldName: 'Prioridade', value: null }))
        .text,
    ).toBe('Cleared Prioridade on "Configurar servidor MCP".');
    expect(api.writes().map((w) => [w.path, w.body])).toEqual([
      [`/cards/${ids.cardA}/custom-fields/${ids.priorityField}`, { value: 'MEDIA' }],
      [`/cards/${ids.cardA}/custom-fields/${ids.priorityField}`, { value: null }],
    ]);
    const unknown = await call('set_custom_field', {
      cardId: ids.cardA,
      fieldName: 'Sprint',
      value: '1',
    });
    expect(unknown.text).toBe(
      'Error: No custom field matches "Sprint". Available: "PR", "Prioridade".',
    );
  });

  it('create_card_from_template resolves the template on the list board', async () => {
    const api = seededApi()
      .on('POST /lists/:id/cards/from-template', () => ({ id: ids.cardB }))
      .on('GET /cards/:id', () =>
        cardDetail({ id: ids.cardB, title: 'Login quebrado', labels: [], customFieldValues: [] }),
      );
    const { call } = await open(api);
    const { text, isError } = await call('create_card_from_template', {
      listId: ids.backlog,
      templateName: 'bug',
      title: 'Login quebrado',
    });
    expect(isError).toBe(false);
    expect(api.writes()).toEqual([
      {
        method: 'POST',
        path: `/lists/${ids.backlog}/cards/from-template`,
        body: { templateId: ids.bugTemplate, title: 'Login quebrado' },
      },
    ]);
    expect(text).toMatch(
      /^Created from template "Bug" in "Backlog" \(checklist: 2 items\):\n- Login quebrado \[card:/,
    );
  });

  it('activity marks agent actors and describes claims and field changes', async () => {
    const api = seededApi().on('GET /boards/:id/activity', () => ({
      nextCursor: null,
      items: [
        {
          id: 'a1',
          cardId: ids.cardB,
          type: 'card.custom_field_set',
          payload: { name: 'PR', value: 'https://github.com/acme/app/pull/9' },
          createdAt: '2026-10-21T12:31:00.000Z',
          actor: { id: ids.agent, name: 'Claude Agent', type: 'agent' },
        },
        {
          id: 'a2',
          cardId: ids.cardB,
          type: 'card.claimed',
          payload: { fromListId: ids.backlog, toListId: ids.progress },
          createdAt: '2026-10-21T12:30:00.000Z',
          actor: { id: ids.agent, name: 'Claude Agent', type: 'agent' },
        },
        {
          id: 'a3',
          cardId: ids.cardA,
          type: 'card.moved',
          payload: {
            fromListId: ids.progress,
            toListId: ids.review,
            automations: { assigneeId: ids.admin, markedDone: true },
          },
          createdAt: '2026-10-21T12:00:00.000Z',
          actor: { id: ids.admin, name: 'Admin', type: 'human' },
        },
      ],
    }));
    const { call } = await open(api);
    const { text } = await call('get_board_activity', { boardId: ids.board });
    expect(text).toMatch(
      /Claude Agent \[agent\] set PR=https:\/\/github.com\/acme\/app\/pull\/9 on "Criar interface"/,
    );
    expect(text).toMatch(
      /Claude Agent \[agent\] claimed card "Criar interface" "Backlog" → "Em Progresso"/,
    );
    expect(text).toMatch(
      /Admin moved card "Configurar servidor MCP" "Em Progresso" → "Revisão" \(automation: marked done, assigned\)/,
    );
  });

  it('update_card can mark a card as completed', async () => {
    const api = seededApi().on('PATCH /cards/:id', () => ({}));
    const { call } = await open(api);
    await call('update_card', { cardId: ids.cardA, completed: true });
    expect(api.writes()[0]!.body).toEqual({ completed: true });
  });
});

describe('errors', () => {
  it('turns API errors into a clear message without stack traces', async () => {
    const api = new FakeApi().on('GET /cards/:id', () => ({
      status: 404,
      json: { error: { code: 'NOT_FOUND', message: 'Card not found' } },
    }));
    const { call } = await open(api);
    const { text, isError } = await call('get_card', { cardId: ids.cardA });
    expect(isError).toBe(true);
    expect(text).toBe('Error: Flowboard API error 404 NOT_FOUND: Card not found');
    expect(text).not.toMatch(/\n\s+at /);
  });

  it('includes validation details', async () => {
    const api = new FakeApi().on('POST /boards/:id/lists', () => ({
      status: 400,
      json: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: [{ path: 'body/title', message: 'Too big' }],
        },
      },
    }));
    const { call } = await open(api);
    const { text } = await call('create_list', { boardId: ids.board, title: 'x' });
    expect(text).toBe(
      'Error: Flowboard API error 400 VALIDATION_ERROR: Request validation failed (body/title: Too big)',
    );
  });

  it('explains a rejected token', async () => {
    const api = new FakeApi().on('GET /boards', () => ({ status: 401, json: { error: {} } }));
    const { call } = await open(api);
    const { text } = await call('list_boards');
    expect(text).toMatch(/^Error: Authentication failed \(401\): FLOWBOARD_TOKEN is invalid/);
  });

  it('explains a missing token without calling the API', async () => {
    const api = seededApi();
    const { call } = await open(api, null);
    const { text, isError } = await call('list_boards');
    expect(isError).toBe(true);
    expect(text).toMatch(/^Error: FLOWBOARD_TOKEN is not set/);
    expect(api.calls).toEqual([]);
  });

  it('explains when the API is unreachable', async () => {
    const api = new FakeApi();
    api.fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const { call } = await open(api);
    const { text } = await call('list_boards');
    expect(text).toBe(
      'Error: Cannot reach the Flowboard API at http://flowboard.test/api. Is the backend running (docker compose up)? Check FLOWBOARD_API_URL.',
    );
  });

  it('rejects invalid arguments before calling the API', async () => {
    const api = seededApi();
    const { call } = await open(api);
    const { isError, text } = await call('get_card', { cardId: 'not-a-uuid' });
    expect(isError).toBe(true);
    expect(text).toMatch(/cardId/);
    expect(api.calls).toEqual([]);
  });
});
