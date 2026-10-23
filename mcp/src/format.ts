import type {
  Activity,
  BoardDetail,
  BoardList,
  BoardSummary,
  CardDetail,
  CardSummary,
  SearchResult,
  User,
} from './types.js';

/**
 * Plain-text renderers. Output is deliberately terse to save model context: one line per card,
 * ids in brackets so they can be passed straight to other tools.
 */

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function dueText(dueDate: string): string {
  return `due ${formatDate(dueDate)}${new Date(dueDate).getTime() < Date.now() ? ' (OVERDUE)' : ''}`;
}

/** Field id → name, to print custom field values on card lines. */
export type FieldNames = Map<string, string>;

export function formatCardLine(
  card: Omit<CardSummary, 'customFieldValues'> & {
    customFieldValues?: CardSummary['customFieldValues'];
  },
  fieldNames?: FieldNames,
): string {
  const meta: string[] = [];
  if (card.completedAt) meta.push('✓ done');
  if (card.labels.length) meta.push(card.labels.map((label) => `#${label.name}`).join(' '));
  if (card.dueDate) meta.push(dueText(card.dueDate));
  if (card.assignee) meta.push(`@${card.assignee.name}`);
  const total = card.checklistItems.length;
  if (total) meta.push(`checklist ${card.checklistItems.filter((i) => i.done).length}/${total}`);
  const comments = card._count.comments;
  if (comments) meta.push(`${comments} comment${comments === 1 ? '' : 's'}`);
  for (const { fieldId, value } of fieldNames ? (card.customFieldValues ?? []) : []) {
    const name = fieldNames?.get(fieldId);
    if (name) meta.push(`${name}=${value}`);
  }
  return `- ${card.title} [card:${card.id}]${meta.length ? ` · ${meta.join(' · ')}` : ''}`;
}

export function formatBoards(boards: BoardSummary[]): string {
  if (boards.length === 0) return 'No boards.';
  return boards
    .map(
      (board) =>
        `- ${board.title} [board:${board.id}]${board.archivedAt ? ' (archived)' : ''}${
          board.description ? ` — ${board.description}` : ''
        }`,
    )
    .join('\n');
}

function describeRules(list: BoardList, board: BoardDetail, users: User[]): string | null {
  const actions: string[] = [];
  if (list.onEnterMarkDone) actions.push('mark done');
  if (list.onEnterAssigneeId) {
    const user = users.find((u) => u.id === list.onEnterAssigneeId);
    actions.push(`assign @${user?.name ?? list.onEnterAssigneeId}`);
  }
  if (list.onEnterLabelId) {
    const label = board.labels.find((l) => l.id === list.onEnterLabelId);
    actions.push(`add #${label?.name ?? list.onEnterLabelId}`);
  }
  return actions.length ? `On enter: ${actions.join(', ')}` : null;
}

export function formatBoard(board: BoardDetail, users: User[] = []): string {
  const lines = [`# ${board.title} [board:${board.id}]${board.archivedAt ? ' (archived)' : ''}`];
  if (board.description) lines.push(board.description);
  if (board.labels.length) lines.push(`Labels: ${board.labels.map((l) => l.name).join(', ')}`);
  if (board.customFields?.length) {
    const fields = board.customFields.map(
      (f) => `${f.name} (${f.type}${f.type === 'select' ? `: ${f.options.join('|')}` : ''})`,
    );
    lines.push(`Custom fields: ${fields.join(', ')}`);
  }
  if (board.templates?.length) {
    lines.push(`Templates: ${board.templates.map((t) => t.name).join(', ')}`);
  }
  const fieldNames: FieldNames = new Map((board.customFields ?? []).map((f) => [f.id, f.name]));
  for (const list of board.lists) {
    const count =
      list.wipLimit !== null && list.wipLimit !== undefined
        ? `${list.cards.length}/${list.wipLimit} WIP${list.cards.length >= list.wipLimit ? ' FULL' : ''}`
        : String(list.cards.length);
    lines.push('', `## ${list.title} [list:${list.id}] (${count})`);
    const rules = describeRules(list, board, users);
    if (rules) lines.push(rules);
    lines.push(
      ...(list.cards.length ? list.cards.map((c) => formatCardLine(c, fieldNames)) : ['(empty)']),
    );
  }
  if (board.lists.length === 0) lines.push('', '(no lists)');
  return lines.join('\n');
}

export function formatCardDetail(card: CardDetail): string {
  const lines = [
    `# ${card.title} [card:${card.id}]${card.archivedAt ? ' (ARCHIVED)' : ''}`,
    `List: ${card.list.title} [list:${card.list.id}] · Board: [board:${card.list.boardId}]`,
  ];
  const meta: string[] = [];
  if (card.labels.length) meta.push(`Labels: ${card.labels.map((l) => l.name).join(', ')}`);
  meta.push(
    `Assignee: ${card.assignee ? `${card.assignee.name} <${card.assignee.email}>` : 'none'}`,
  );
  meta.push(card.dueDate ? dueText(card.dueDate).replace(/^due/, 'Due:') : 'Due: none');
  if (card.completedAt) meta.push(`Done ${formatDate(card.completedAt)}`);
  lines.push(meta.join(' · '));
  if (card.customFieldValues?.length) {
    lines.push(card.customFieldValues.map((v) => `${v.field.name}: ${v.value}`).join(' · '));
  }
  lines.push(
    `Created ${formatDateTime(card.createdAt)} · Updated ${formatDateTime(card.updatedAt)}`,
  );

  lines.push('', '## Description', card.description?.trim() || '(none)');

  const done = card.checklistItems.filter((item) => item.done).length;
  lines.push('', `## Checklist (${done}/${card.checklistItems.length})`);
  if (card.checklistItems.length === 0) lines.push('(none)');
  for (const item of card.checklistItems) {
    lines.push(`- [${item.done ? 'x' : ' '}] ${item.text} [item:${item.id}]`);
  }

  lines.push('', `## Comments (${card.comments.length})`);
  if (card.comments.length === 0) lines.push('(none)');
  for (const comment of card.comments) {
    lines.push(`- ${comment.author.name}, ${formatDateTime(comment.createdAt)}: ${comment.body}`);
  }
  return lines.join('\n');
}

export function formatSearchResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) return `No cards match "${query}".`;
  return [
    `${results.length} card(s) matching "${query}":`,
    ...results.map(
      (card) => `${formatCardLine(card)} · in ${card.list.board.title} › ${card.list.title}`,
    ),
  ].join('\n');
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);

/** One line per activity. Names are resolved from the board where possible. */
export function formatActivity(items: Activity[], board: BoardDetail): string {
  if (items.length === 0) return `No activity on "${board.title}".`;

  const listTitles = new Map(board.lists.map((list) => [list.id, list.title]));
  const cardTitles = new Map(
    board.lists.flatMap((list) => list.cards.map((card) => [card.id, card.title] as const)),
  );
  const listName = (id: unknown) => `"${listTitles.get(str(id) ?? '') ?? 'archived list'}"`;
  const labelNames = new Map(board.labels.map((label) => [label.id, label.name]));

  const describe = (activity: Activity): string => {
    const p = activity.payload;
    const card = activity.cardId
      ? `"${cardTitles.get(activity.cardId) ?? str(p.title) ?? `card ${activity.cardId.slice(0, 8)}`}"`
      : '';
    const changes = Object.keys((p.changes as Record<string, unknown> | undefined) ?? {}).map(
      (key) => (key === 'assigneeId' ? 'assignee' : key),
    );
    const automations = (p.automations ?? null) as {
      assigneeId?: string;
      labelId?: string;
      markedDone?: boolean;
    } | null;
    const auto = automations
      ? ` (automation: ${[
          automations.markedDone ? 'marked done' : null,
          automations.assigneeId ? 'assigned' : null,
          automations.labelId ? `#${labelNames.get(automations.labelId) ?? 'label'}` : null,
        ]
          .filter(Boolean)
          .join(', ')})`
      : '';
    switch (activity.type) {
      case 'card.created':
        return `created card ${card} in ${listName(p.listId)}${
          p.templateName ? ` from template "${str(p.templateName)}"` : ''
        }${auto}`;
      case 'card.moved':
        return p.fromListId === p.toListId
          ? `reordered card ${card} in ${listName(p.toListId)}`
          : `moved card ${card} ${listName(p.fromListId)} → ${listName(p.toListId)}${auto}`;
      case 'card.claimed':
        return `claimed card ${card} ${listName(p.fromListId)} → ${listName(p.toListId)}${auto}`;
      case 'card.custom_field_set':
        return p.value === null
          ? `cleared ${str(p.name)} on ${card}`
          : `set ${str(p.name)}=${str(p.value)} on ${card}`;
      case 'card.updated':
        return `updated card ${card} (${changes.join(', ') || 'fields'})`;
      case 'card.label_added':
      case 'card.label_removed':
        return `${activity.type === 'card.label_added' ? 'added' : 'removed'} label #${
          labelNames.get(str(p.labelId) ?? '') ?? '?'
        } on ${card}`;
      case 'comment.created':
        return `commented on ${card}`;
      case 'checklist_item.created':
        return `added checklist item "${str(p.text)}" to ${card}`;
      case 'checklist_item.updated': {
        const done = (p.changes as { done?: boolean } | undefined)?.done;
        if (done !== undefined)
          return `${done ? 'checked' : 'unchecked'} a checklist item on ${card}`;
        return `edited a checklist item on ${card}`;
      }
      case 'list.created':
        return `created list "${str(p.title)}"`;
      case 'list.updated':
        return `renamed list to "${str((p.to as { title?: string } | undefined)?.title)}"`;
      case 'board.created':
        return `created the board`;
      default: {
        const [entity, action] = activity.type.split('.');
        return `${action ?? activity.type} ${entity}${card ? ` ${card}` : ''}`;
      }
    }
  };

  return items
    .map(
      (a) =>
        `- ${formatDateTime(a.createdAt)} ${a.actor.name}${a.actor.type === 'agent' ? ' [agent]' : ''} ${describe(a)}`,
    )
    .join('\n');
}
