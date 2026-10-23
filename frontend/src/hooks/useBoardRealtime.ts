import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { queryKeys } from '../lib/query-keys';

export const BOARD_POLL_INTERVAL_MS = 5000;

/**
 * Keeps everything under ['board', boardId] fresh so changes made elsewhere (e.g. Claude Code via
 * MCP) show up without a reload.
 *
 * Today this polls. To switch to WebSocket, replace the body with a subscription that calls the
 * same `invalidateQueries` (or `setQueryData`) on server events; callers don't change.
 *
 * Refreshes are skipped while `paused` (e.g. mid-drag), while the tab is hidden, and while a board
 * mutation is in flight (so an optimistic update isn't overwritten by a stale response).
 */
export function useBoardRealtime(boardId: string, options: { paused?: boolean } = {}): void {
  const queryClient = useQueryClient();
  const { paused = false } = options;

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (queryClient.isMutating({ mutationKey: queryKeys.board(boardId) }) > 0) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.board(boardId) });
    }, BOARD_POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [boardId, paused, queryClient]);
}
