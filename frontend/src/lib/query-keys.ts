/**
 * Everything belonging to a board lives under ['board', boardId] so that a single invalidation
 * (polling today, WebSocket later) refreshes the board, open card and its activity together.
 */
export const queryKeys = {
  me: ['me'] as const,
  users: ['users'] as const,
  boards: ['boards'] as const,
  tokens: ['tokens'] as const,
  board: (boardId: string) => ['board', boardId] as const,
  boardDetail: (boardId: string) => ['board', boardId, 'detail'] as const,
  card: (boardId: string, cardId: string) => ['board', boardId, 'card', cardId] as const,
  cardActivity: (boardId: string, cardId: string) =>
    ['board', boardId, 'card', cardId, 'activity'] as const,
};
