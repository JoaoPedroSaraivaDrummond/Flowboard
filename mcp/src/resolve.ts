import { FlowboardError, type FlowboardClient } from './client.js';
import type { User } from './types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string) => UUID.test(value.trim());

/** Case- and accent-insensitive comparison key ("Revisão" == "revisao"). */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Finds the item whose id equals `query` or whose name matches it (case/accent-insensitive).
 * Errors list the available names so the model can retry.
 */
export function resolveByIdOrName<T extends { id: string }>(
  items: T[],
  query: string,
  nameOf: (item: T) => string,
  kind: string,
): T {
  const byId = items.find((item) => item.id === query.trim());
  if (byId) return byId;

  const key = normalizeName(query);
  const matches = items.filter((item) => normalizeName(nameOf(item)) === key);
  if (matches.length === 1) return matches[0]!;

  const available = items.map((item) => `"${nameOf(item)}"`).join(', ') || '(none)';
  if (matches.length > 1) {
    throw new FlowboardError(
      `Ambiguous ${kind} "${query}": ${matches.length} matches. Use the id instead: ${matches
        .map((item) => item.id)
        .join(', ')}.`,
    );
  }
  throw new FlowboardError(`No ${kind} matches "${query}". Available: ${available}.`);
}

/** Accepts a board id or a board title. */
export async function resolveBoardId(client: FlowboardClient, idOrTitle: string): Promise<string> {
  if (isUuid(idOrTitle)) return idOrTitle.trim();
  const boards = await client.listBoards();
  return resolveByIdOrName(boards, idOrTitle, (board) => board.title, 'board').id;
}

export function resolveUser(users: User[], query: string): User {
  const key = normalizeName(query);
  const byEmail = users.find((user) => user.email.toLowerCase() === key);
  if (byEmail) return byEmail;
  return resolveByIdOrName(users, query, (user) => user.name, 'user');
}

/**
 * `YYYY-MM-DD` → end of that day in the server's local time zone (same convention as the web UI);
 * full ISO datetimes are passed through.
 */
export function parseDueDate(input: string): string {
  const value = input.trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T23:59:59`) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new FlowboardError(`Invalid dueDate "${input}". Use YYYY-MM-DD or an ISO 8601 datetime.`);
  }
  return date.toISOString();
}
