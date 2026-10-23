import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { FlowboardClient } from '../src/client.js';
import { createServer } from '../src/server.js';
import type { BoardDetail, CardDetail, CardSummary, LabelRef, User } from '../src/types.js';

export type Call = { method: string; path: string; body?: unknown };
type Reply = { status?: number; json?: unknown };
type Handler = (call: Call, params: Record<string, string>) => Reply | unknown;

/**
 * In-memory stand-in for the Flowboard REST API. Routes are "METHOD /path/:param"; a handler may
 * return a plain value (200 JSON) or `{ status, json }`. Every request is recorded in `calls`.
 */
export class FakeApi {
  readonly calls: Call[] = [];
  private routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];

  on(route: string, handler: Handler): this {
    const [method, path] = route.split(' ') as [string, string];
    const keys: string[] = [];
    const pattern = new RegExp(
      `^${path.replace(/:(\w+)/g, (_, key: string) => {
        keys.push(key);
        return '([^/?]+)';
      })}$`,
    );
    this.routes.unshift({ method, pattern, keys, handler });
    return this;
  }

  fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.replace(/^\/api/, '') + url.search;
    const method = init?.method ?? 'GET';
    const call: Call = {
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    this.calls.push(call);
    for (const route of this.routes) {
      const match =
        route.method === method && route.pattern.exec(url.pathname.replace(/^\/api/, ''));
      if (!match) continue;
      const params = Object.fromEntries(route.keys.map((key, i) => [key, match[i + 1]!]));
      const result = route.handler(call, params);
      const reply: Reply =
        result && typeof result === 'object' && ('status' in result || 'json' in result)
          ? (result as Reply)
          : { json: result };
      const status = reply.status ?? 200;
      return new Response(status === 204 ? null : JSON.stringify(reply.json ?? null), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({ error: { code: 'ROUTE_NOT_FOUND', message: `${method} ${url.pathname}` } }),
      { status: 404 },
    );
  };

  /** Calls made with a given method (ignores the read-only GETs). */
  writes(): Call[] {
    return this.calls.filter((call) => call.method !== 'GET');
  }
}

/** Connects a real MCP client to the server over an in-memory transport. */
export async function connect(api: FakeApi, token: string | null = 'fb_test') {
  const flowboard = new FlowboardClient({ apiUrl: 'http://flowboard.test/api', token }, api.fetch);
  const server = createServer(flowboard);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text: string }[];
    return { text: content.map((c) => c.text).join('\n'), isError: result.isError === true };
  };
  return { client, call, close: () => client.close() };
}

// ---- fixtures -------------------------------------------------------------------------------

export const ids = {
  board: '11111111-1111-4111-8111-111111111111',
  backlog: '22222222-2222-4222-8222-222222222221',
  progress: '22222222-2222-4222-8222-222222222222',
  review: '22222222-2222-4222-8222-222222222223',
  cardA: '33333333-3333-4333-8333-333333333331',
  cardB: '33333333-3333-4333-8333-333333333332',
  item: '44444444-4444-4444-8444-444444444441',
  bug: '55555555-5555-4555-8555-555555555551',
  feature: '55555555-5555-4555-8555-555555555552',
  admin: '66666666-6666-4666-8666-666666666661',
  agent: '66666666-6666-4666-8666-666666666663',
  prField: '88888888-8888-4888-8888-888888888881',
  priorityField: '88888888-8888-4888-8888-888888888882',
  bugTemplate: '99999999-9999-4999-8999-999999999991',
  ana: '66666666-6666-4666-8666-666666666662',
};

export const users: User[] = [
  { id: ids.admin, name: 'Admin', email: 'admin@flowboard.local', type: 'human' },
  { id: ids.ana, name: 'Ana Souza', email: 'ana@flowboard.local', type: 'human' },
  { id: ids.agent, name: 'Claude Agent', email: 'claude-agent@flowboard.local', type: 'agent' },
];

const noRules = {
  wipLimit: null,
  onEnterMarkDone: false,
  onEnterAssigneeId: null,
  onEnterLabelId: null,
};

export const boardLabels: LabelRef[] = [
  { id: ids.bug, name: 'bug', color: '#ef4444' },
  { id: ids.feature, name: 'feature', color: '#22c55e' },
];

export function summary(
  overrides: Partial<CardSummary> & { id: string; title: string },
): CardSummary {
  return {
    listId: ids.backlog,
    description: null,
    dueDate: null,
    completedAt: null,
    archivedAt: null,
    labels: [],
    assignee: null,
    _count: { comments: 0, checklistItems: 0 },
    checklistItems: [],
    customFieldValues: [],
    ...overrides,
  };
}

export function board(): BoardDetail {
  return {
    id: ids.board,
    title: 'Fluxo de Desenvolvimento',
    description: 'Board de exemplo',
    archivedAt: null,
    labels: boardLabels,
    customFields: [
      { id: ids.prField, name: 'PR', type: 'url', options: [] },
      {
        id: ids.priorityField,
        name: 'Prioridade',
        type: 'select',
        options: ['alta', 'média', 'baixa'],
      },
    ],
    templates: [
      {
        id: ids.bugTemplate,
        name: 'Bug',
        description: '## Passos',
        checklist: ['Reproduzir', 'Corrigir'],
      },
    ],
    lists: [
      {
        ...noRules,
        id: ids.backlog,
        boardId: ids.board,
        title: 'Backlog',
        cards: [
          summary({
            id: ids.cardA,
            title: 'Configurar servidor MCP',
            labels: [boardLabels[1]!],
            dueDate: '2099-12-25T23:59:59.000Z',
            assignee: users[0]!,
            checklistItems: [{ done: true }, { done: false }],
            _count: { comments: 2, checklistItems: 2 },
            customFieldValues: [{ fieldId: ids.priorityField, value: 'alta' }],
          }),
        ],
      },
      {
        ...noRules,
        wipLimit: 1,
        id: ids.progress,
        boardId: ids.board,
        title: 'Em Progresso',
        cards: [summary({ id: ids.cardB, title: 'Criar interface', listId: ids.progress })],
      },
      {
        ...noRules,
        onEnterAssigneeId: ids.admin,
        onEnterMarkDone: true,
        id: ids.review,
        boardId: ids.board,
        title: 'Revisão',
        cards: [],
      },
    ],
  };
}

export function cardDetail(overrides: Partial<CardDetail> = {}): CardDetail {
  return {
    ...summary({ id: ids.cardA, title: 'Configurar servidor MCP' }),
    description: 'Expor quadros via **MCP**.',
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-21T10:00:00.000Z',
    list: { id: ids.backlog, title: 'Backlog', boardId: ids.board },
    labels: [boardLabels[1]!],
    customFieldValues: [
      {
        fieldId: ids.prField,
        value: 'https://github.com/acme/app/pull/7',
        field: { name: 'PR', type: 'url' },
      },
    ],
    checklistItems: [
      { id: ids.item, cardId: ids.cardA, text: 'Definir ferramentas', done: true },
      {
        id: '44444444-4444-4444-8444-444444444442',
        cardId: ids.cardA,
        text: 'Testes',
        done: false,
      },
    ],
    comments: [
      {
        id: '77777777-7777-4777-8777-777777777771',
        body: 'Começando hoje',
        createdAt: '2026-10-21T09:00:00.000Z',
        author: { id: ids.admin, name: 'Admin' },
      },
    ],
    ...overrides,
  };
}

/** API with the fixture board wired to the usual read endpoints. */
export function seededApi(): FakeApi {
  return new FakeApi()
    .on('GET /boards', () => [
      {
        id: ids.board,
        title: 'Fluxo de Desenvolvimento',
        description: 'Board de exemplo',
        archivedAt: null,
      },
      {
        id: '11111111-1111-4111-8111-111111111112',
        title: 'Marketing',
        description: null,
        archivedAt: null,
      },
    ])
    .on('GET /boards/:id', () => board())
    .on('GET /boards/:id/labels', () => boardLabels)
    .on('GET /cards/:id', () => cardDetail())
    .on('GET /users', () => users)
    .on('GET /boards/:id/custom-fields', () => board().customFields)
    .on('GET /boards/:id/templates', () => board().templates)
    .on('GET /lists/:id', (_call, params) => ({
      ...board().lists.find((l) => l.id === params.id)!,
      cards: undefined,
    }));
}
