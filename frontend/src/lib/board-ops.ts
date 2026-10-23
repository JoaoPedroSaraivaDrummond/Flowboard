import type { BoardDetail, BoardList, ListRules, MoveTarget } from './types';

/** Pure helpers used both while dragging and for optimistic cache updates. */

export function findListOfCard(lists: BoardList[], cardId: string): BoardList | undefined {
  return lists.find((list) => list.cards.some((card) => card.id === cardId));
}

function insertAt<T>(items: T[], index: number, item: T): T[] {
  const copy = [...items];
  copy.splice(Math.max(0, Math.min(index, copy.length)), 0, item);
  return copy;
}

export function arrayMove<T>(items: T[], from: number, to: number): T[] {
  const copy = [...items];
  const [moved] = copy.splice(from, 1);
  if (moved === undefined) return items;
  copy.splice(to, 0, moved);
  return copy;
}

/** Moves a card to `toListId` at `toIndex` (index in the destination after removal). */
export function moveCardInLists(
  lists: BoardList[],
  cardId: string,
  toListId: string,
  toIndex: number,
): BoardList[] {
  const from = findListOfCard(lists, cardId);
  const card = from?.cards.find((c) => c.id === cardId);
  if (!from || !card) return lists;
  return lists
    .map((list) =>
      list.id === from.id ? { ...list, cards: list.cards.filter((c) => c.id !== cardId) } : list,
    )
    .map((list) =>
      list.id === toListId
        ? { ...list, cards: insertAt(list.cards, toIndex, { ...card, listId: toListId }) }
        : list,
    );
}

/**
 * Index in the full (unfiltered) destination list for an API target computed from the visible
 * cards, so optimistic updates stay correct while board filters hide some cards.
 */
export function indexFromTarget(
  cards: { id: string }[],
  target: MoveTarget,
  movingId: string,
): number {
  const others = cards.filter((card) => card.id !== movingId);
  if (target.afterId) {
    const at = others.findIndex((card) => card.id === target.afterId);
    if (at !== -1) return at + 1;
  }
  if (target.beforeId) {
    const at = others.findIndex((card) => card.id === target.beforeId);
    if (at !== -1) return at;
  }
  return Math.min(target.index ?? others.length, others.length);
}

export function moveListInLists(lists: BoardList[], listId: string, toIndex: number): BoardList[] {
  const from = lists.findIndex((list) => list.id === listId);
  return from === -1 ? lists : arrayMove(lists, from, toIndex);
}

export function withLists(board: BoardDetail, lists: BoardList[]): BoardDetail {
  return { ...board, lists };
}

/**
 * API target for an item that ended up at `index` of `orderedIds` (which includes the item).
 * Anchoring on a neighbour is more robust than a bare index when others edit concurrently.
 */
export function neighborTarget(orderedIds: string[], index: number): MoveTarget {
  const previous = orderedIds[index - 1];
  if (previous) return { afterId: previous };
  const next = orderedIds[index + 1];
  if (next) return { beforeId: next };
  return { index: 0 };
}

/** True when the list has at least one on-enter automation. */
export function hasListRules(list: ListRules): boolean {
  return list.onEnterMarkDone || Boolean(list.onEnterAssigneeId) || Boolean(list.onEnterLabelId);
}
