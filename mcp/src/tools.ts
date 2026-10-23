import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { FlowboardError, type FlowboardClient } from './client.js';
import {
  formatActivity,
  formatBoard,
  formatBoards,
  formatCardDetail,
  formatCardLine,
  formatSearchResults,
} from './format.js';
import { parseDueDate, resolveBoardId, resolveByIdOrName, resolveUser } from './resolve.js';
import type { CardFields, LabelRef } from './types.js';

/** Runs a tool body and turns any failure into a concise error message for the model. */
async function respond(body: () => Promise<string>): Promise<CallToolResult> {
  try {
    return { content: [{ type: 'text', text: await body() }] };
  } catch (error) {
    const message =
      error instanceof FlowboardError
        ? error.message
        : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
}

const cardId = z.uuid().describe('Card id (the value after "card:" in other tool outputs)');
const boardRef = z
  .string()
  .min(1)
  .describe('Board id, or the exact board title (case- and accent-insensitive)');
const position = z
  .enum(['top', 'bottom'])
  .optional()
  .describe('Where to place the card in the list (default: bottom)');
const dueDate = z
  .string()
  .describe('YYYY-MM-DD (end of that day, local time) or an ISO 8601 datetime');
const labels = z
  .array(z.string().min(1))
  .describe("Label names (case-insensitive) or ids; they must exist on the card's board");

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

/** Resolves label names/ids against the board's labels; throws listing what exists. */
function resolveLabels(boardLabels: LabelRef[], requested: string[]): LabelRef[] {
  return requested.map((query) => resolveByIdOrName(boardLabels, query, (l) => l.name, 'label'));
}

export function registerTools(server: McpServer, client: FlowboardClient): void {
  server.registerTool(
    'list_boards',
    {
      title: 'List boards',
      description: 'List Flowboard boards with their ids. Start here to find a board.',
      inputSchema: {
        includeArchived: z.boolean().optional().describe('Include archived boards (default false)'),
      },
      annotations: READ,
    },
    ({ includeArchived }) =>
      respond(async () => formatBoards(await client.listBoards(includeArchived ?? false))),
  );

  server.registerTool(
    'get_board',
    {
      title: 'Get board',
      description:
        'Show a board: its lists in order and, under each list, its active cards in order (title, labels, due date, assignee, checklist progress). Returns list and card ids for other tools.',
      inputSchema: { boardId: boardRef },
      annotations: READ,
    },
    ({ boardId }) =>
      respond(async () => {
        const id = await resolveBoardId(client, boardId);
        const [board, users] = await Promise.all([client.getBoard(id), client.listUsers()]);
        return formatBoard(board, users);
      }),
  );

  server.registerTool(
    'get_card',
    {
      title: 'Get card',
      description:
        'Full detail of a card: description (markdown), labels, assignee, due date, checklist items (with item ids) and comments.',
      inputSchema: { cardId },
      annotations: READ,
    },
    ({ cardId: id }) => respond(async () => formatCardDetail(await client.getCard(id))),
  );

  server.registerTool(
    'search_cards',
    {
      title: 'Search cards',
      description:
        'Case-insensitive search in titles and descriptions of active cards, across all boards or one board.',
      inputSchema: {
        query: z.string().min(1).describe('Text to search for'),
        boardId: boardRef.optional(),
        limit: z.number().int().min(1).max(50).optional().describe('Max results (default 20)'),
      },
      annotations: READ,
    },
    ({ query, boardId, limit }) =>
      respond(async () => {
        const board = boardId ? await resolveBoardId(client, boardId) : undefined;
        return formatSearchResults(query, await client.searchCards(query, board, limit ?? 20));
      }),
  );

  server.registerTool(
    'create_card',
    {
      title: 'Create card',
      description: 'Create a card in a list (use get_board to find list ids).',
      inputSchema: {
        listId: z.uuid().describe('List id (the value after "list:" in get_board)'),
        title: z.string().min(1).max(500),
        description: z.string().optional().describe('Markdown'),
        labels: labels.optional(),
        dueDate: dueDate.optional(),
        position,
      },
      annotations: WRITE,
    },
    (input) =>
      respond(async () => {
        const created = await client.createCard(input.listId, {
          title: input.title,
          description: input.description,
          dueDate: input.dueDate ? parseDueDate(input.dueDate) : undefined,
          ...(input.position === 'top' ? { index: 0 } : {}),
        });
        let card = await client.getCard(created.id);
        if (input.labels?.length) {
          const boardLabels = await client.boardLabels(card.list.boardId);
          try {
            for (const label of resolveLabels(boardLabels, input.labels)) {
              await client.addCardLabel(card.id, label.id);
            }
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            throw new FlowboardError(
              `Card "${card.title}" [card:${card.id}] was created, but labels were not applied: ${reason}`,
            );
          }
          card = await client.getCard(card.id);
        }
        return `Created in "${card.list.title}":\n${formatCardLine(card)}`;
      }),
  );

  server.registerTool(
    'update_card',
    {
      title: 'Update card',
      description:
        'Change some fields of a card; omitted fields are kept. Use null to clear description, dueDate or assignee. `completed` marks it done. `labels` replaces the whole label set. `archived: true` archives the card (soft delete; there is no permanent deletion). To change the list, use move_card.',
      inputSchema: {
        cardId,
        title: z.string().min(1).max(500).optional(),
        description: z.string().nullable().optional().describe('Markdown; null clears it'),
        dueDate: dueDate.nullable().optional(),
        assignee: z
          .string()
          .nullable()
          .optional()
          .describe('User name, email or id; null unassigns'),
        labels: labels.optional(),
        completed: z.boolean().optional().describe('Mark the card as done / not done'),
        archived: z.boolean().optional().describe('true archives, false restores'),
      },
      annotations: WRITE,
    },
    (input) =>
      respond(async () => {
        const fields: CardFields = {};
        const changed: string[] = [];
        if (input.title !== undefined) fields.title = input.title;
        if (input.completed !== undefined) fields.completed = input.completed;
        if (input.description !== undefined) fields.description = input.description;
        if (input.dueDate !== undefined) {
          fields.dueDate = input.dueDate === null ? null : parseDueDate(input.dueDate);
        }
        if (input.assignee !== undefined) {
          fields.assigneeId =
            input.assignee === null
              ? null
              : resolveUser(await client.listUsers(), input.assignee).id;
        }
        const nothingToDo =
          Object.keys(fields).length === 0 &&
          input.labels === undefined &&
          input.archived === undefined;
        if (nothingToDo) throw new FlowboardError('Nothing to update: pass at least one field.');

        if (Object.keys(fields).length) {
          await client.updateCard(input.cardId, fields);
          changed.push(
            ...Object.keys(fields).map((key) => (key === 'assigneeId' ? 'assignee' : key)),
          );
        }

        if (input.labels !== undefined) {
          const current = await client.getCard(input.cardId);
          const wanted = resolveLabels(
            await client.boardLabels(current.list.boardId),
            input.labels,
          );
          const wantedIds = new Set(wanted.map((label) => label.id));
          const currentIds = new Set(current.labels.map((label) => label.id));
          const added = wanted.filter((label) => !currentIds.has(label.id));
          const removed = current.labels.filter((label) => !wantedIds.has(label.id));
          for (const label of added) await client.addCardLabel(input.cardId, label.id);
          for (const label of removed) await client.removeCardLabel(input.cardId, label.id);
          const diff = [...added.map((l) => `+${l.name}`), ...removed.map((l) => `-${l.name}`)];
          changed.push(`labels (${diff.join(' ') || 'unchanged'})`);
        }

        if (input.archived !== undefined) {
          await client.setCardArchived(input.cardId, input.archived);
          changed.push(input.archived ? 'archived' : 'restored');
        }

        const card = await client.getCard(input.cardId);
        return `Updated ${changed.join(', ')}:\n${formatCardLine(card)}${
          card.archivedAt ? ' (ARCHIVED)' : ''
        }`;
      }),
  );

  server.registerTool(
    'move_card',
    {
      title: 'Move card',
      description:
        'Move a card to a list of the same board, given by list id or list name (case- and accent-insensitive, e.g. "em progresso"). Also reorders within the current list.',
      inputSchema: {
        cardId,
        list: z.string().min(1).describe('Target list id or name'),
        position,
      },
      annotations: WRITE,
    },
    ({ cardId: id, list, position: where }) =>
      respond(async () => {
        const card = await client.getCard(id);
        const board = await client.getBoard(card.list.boardId);
        const target = resolveByIdOrName(board.lists, list, (l) => l.title, 'list on this board');
        await client.moveCard(id, target.id, where === 'top' ? { index: 0 } : {});
        const place = where === 'top' ? 'top' : 'bottom';
        return target.id === card.list.id
          ? `Moved "${card.title}" to the ${place} of "${target.title}".`
          : `Moved "${card.title}" from "${card.list.title}" to "${target.title}" (${place}).`;
      }),
  );

  server.registerTool(
    'add_comment',
    {
      title: 'Add comment',
      description: 'Add a comment (markdown) to a card, authored by the token owner.',
      inputSchema: { cardId, body: z.string().min(1).max(10_000).describe('Markdown') },
      annotations: WRITE,
    },
    ({ cardId: id, body }) =>
      respond(async () => {
        const comment = await client.addComment(id, body);
        return `Comment added [comment:${comment.id}] to [card:${id}].`;
      }),
  );

  server.registerTool(
    'add_checklist_item',
    {
      title: 'Add checklist item',
      description: "Append an item to a card's checklist.",
      inputSchema: { cardId, text: z.string().min(1).max(1000) },
      annotations: WRITE,
    },
    ({ cardId: id, text }) =>
      respond(async () => {
        const item = await client.addChecklistItem(id, text);
        return `Added checklist item "${item.text}" [item:${item.id}] to [card:${id}].`;
      }),
  );

  server.registerTool(
    'toggle_checklist_item',
    {
      title: 'Check / uncheck checklist item',
      description: 'Mark a checklist item as done or not done (item ids come from get_card).',
      inputSchema: {
        itemId: z.uuid().describe('Checklist item id (the value after "item:" in get_card)'),
        done: z.boolean(),
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ itemId, done }) =>
      respond(async () => {
        const item = await client.updateChecklistItem(itemId, { done });
        return `Checklist item "${item.text}" marked ${done ? 'done' : 'not done'}.`;
      }),
  );

  server.registerTool(
    'create_list',
    {
      title: 'Create list',
      description: 'Add a list (column) at the end of a board.',
      inputSchema: { boardId: boardRef, title: z.string().min(1).max(200) },
      annotations: WRITE,
    },
    ({ boardId, title }) =>
      respond(async () => {
        const list = await client.createList(await resolveBoardId(client, boardId), title);
        return `Created list "${list.title}" [list:${list.id}] on [board:${list.boardId}].`;
      }),
  );

  server.registerTool(
    'claim_next_card',
    {
      title: 'Claim next card',
      description:
        'Atomically take the TOP card of `fromList`, assign it to you (the token owner) and move it to the end of `toList`. Safe when several agents work in parallel: each claim gets a different card. Returns the full card so you can start working. Fails if `fromList` is empty or `toList` is at its WIP limit.',
      inputSchema: {
        boardId: boardRef,
        fromList: z.string().min(1).describe('Source list id or name, e.g. "A Fazer"'),
        toList: z.string().min(1).describe('Target list id or name, e.g. "Em Progresso"'),
      },
      annotations: WRITE,
    },
    ({ boardId, fromList, toList }) =>
      respond(async () => {
        const board = await client.getBoard(await resolveBoardId(client, boardId));
        const from = resolveByIdOrName(board.lists, fromList, (l) => l.title, 'list on this board');
        const to = resolveByIdOrName(board.lists, toList, (l) => l.title, 'list on this board');
        const card = await client.claimNextCard(board.id, from.id, to.id);
        return `Claimed from "${from.title}" → "${to.title}", assigned to ${
          card.assignee?.name ?? 'you'
        }.\n\n${formatCardDetail(card)}`;
      }),
  );

  server.registerTool(
    'set_custom_field',
    {
      title: 'Set custom field',
      description:
        'Set a custom field of a card by field name (e.g. "PR" = PR URL, "Branch", "Prioridade"). Values are validated by type (text, number, url, select option). null or "" clears it. get_board lists the available fields.',
      inputSchema: {
        cardId,
        fieldName: z.string().min(1).describe('Field name (case/accent-insensitive) or id'),
        value: z
          .union([z.string(), z.number(), z.null()])
          .describe('New value; null or "" clears the field'),
      },
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ cardId: id, fieldName, value }) =>
      respond(async () => {
        const card = await client.getCard(id);
        const fields = await client.boardCustomFields(card.list.boardId);
        const field = resolveByIdOrName(fields, fieldName, (f) => f.name, 'custom field');
        const result = await client.setCustomField(id, field.id, value);
        return result.value === null
          ? `Cleared ${field.name} on "${card.title}".`
          : `Set ${field.name} = ${result.value} on "${card.title}".`;
      }),
  );

  server.registerTool(
    'create_card_from_template',
    {
      title: 'Create card from template',
      description:
        "Create a card in a list from one of the board's templates (copies its description and checklist). Template names are listed by get_board.",
      inputSchema: {
        listId: z.uuid().describe('List id (the value after "list:" in get_board)'),
        templateName: z.string().min(1).describe('Template name (case/accent-insensitive) or id'),
        title: z.string().min(1).max(500),
      },
      annotations: WRITE,
    },
    ({ listId, templateName, title }) =>
      respond(async () => {
        const list = await client.getList(listId);
        const templates = await client.boardTemplates(list.boardId);
        const template = resolveByIdOrName(templates, templateName, (t) => t.name, 'template');
        const created = await client.createCardFromTemplate(listId, template.id, title);
        const card = await client.getCard(created.id);
        return `Created from template "${template.name}" in "${card.list.title}" (checklist: ${
          card.checklistItems.length
        } items):\n${formatCardLine(card)}`;
      }),
  );

  server.registerTool(
    'get_board_activity',
    {
      title: 'Board activity',
      description: 'Recent activity on a board, newest first (who did what and when).',
      inputSchema: {
        boardId: boardRef,
        limit: z.number().int().min(1).max(100).optional().describe('Entries (default 20)'),
      },
      annotations: READ,
    },
    ({ boardId, limit }) =>
      respond(async () => {
        const id = await resolveBoardId(client, boardId);
        const [activity, board] = await Promise.all([
          client.boardActivity(id, limit ?? 20),
          client.getBoard(id),
        ]);
        return formatActivity(activity.items, board);
      }),
  );
}
