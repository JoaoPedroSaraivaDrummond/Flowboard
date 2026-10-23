import type { BoardList, CardSummary } from './types';

export type BoardFilters = {
  text: string;
  labelIds: string[];
  /** A user id, or "none" for unassigned cards. */
  assignee: string | null;
  onlyMine: boolean;
};

export const EMPTY_FILTERS: BoardFilters = {
  text: '',
  labelIds: [],
  assignee: null,
  onlyMine: false,
};

/** Filters live in the URL (?q=&labels=a,b&assignee=&mine=1) so they survive reloads and can be shared. */
export function filtersFromParams(params: URLSearchParams): BoardFilters {
  return {
    text: params.get('q') ?? '',
    labelIds: params.get('labels')?.split(',').filter(Boolean) ?? [],
    assignee: params.get('assignee'),
    onlyMine: params.get('mine') === '1',
  };
}

export function filtersToParams(filters: BoardFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.text) params.set('q', filters.text);
  if (filters.labelIds.length) params.set('labels', filters.labelIds.join(','));
  if (filters.assignee) params.set('assignee', filters.assignee);
  if (filters.onlyMine) params.set('mine', '1');
  return params;
}

export function hasActiveFilters(filters: BoardFilters): boolean {
  return Boolean(filters.text || filters.labelIds.length || filters.assignee || filters.onlyMine);
}

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function cardMatches(
  card: CardSummary,
  filters: BoardFilters,
  currentUserId?: string,
): boolean {
  if (filters.text) {
    const haystack = normalize(`${card.title} ${card.description ?? ''}`);
    if (!haystack.includes(normalize(filters.text.trim()))) return false;
  }
  // Labels: the card must have at least one of the selected labels.
  if (
    filters.labelIds.length &&
    !card.labels.some((label) => filters.labelIds.includes(label.id))
  ) {
    return false;
  }
  if (filters.assignee === 'none' && card.assigneeId) return false;
  if (filters.assignee && filters.assignee !== 'none' && card.assigneeId !== filters.assignee) {
    return false;
  }
  if (filters.onlyMine && (!currentUserId || card.assigneeId !== currentUserId)) return false;
  return true;
}

export function filterLists(
  lists: BoardList[],
  filters: BoardFilters,
  currentUserId?: string,
): BoardList[] {
  if (!hasActiveFilters(filters)) return lists;
  return lists.map((list) => ({
    ...list,
    cards: list.cards.filter((card) => cardMatches(card, filters, currentUserId)),
  }));
}
