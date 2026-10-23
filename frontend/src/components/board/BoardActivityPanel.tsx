import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { describeActivity } from '../../lib/activity';
import { formatRelative } from '../../lib/format';
import { queryKeys } from '../../lib/query-keys';
import type { BoardDetail } from '../../lib/types';
import { AgentBadge } from '../ui/AgentBadge';
import { Avatar } from '../ui/Avatar';
import { CloseIcon } from '../ui/icons';
import { ghostButtonClass } from '../ui/styles';

/** Side panel with the whole board's activity; refreshed by the board polling (same key prefix). */
export function BoardActivityPanel({
  board,
  onClose,
}: {
  board: BoardDetail;
  onClose: () => void;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } = useInfiniteQuery({
    queryKey: [...queryKeys.board(board.id), 'activity'],
    queryFn: ({ pageParam }) => api.boardActivity(board.id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const listTitle = (listId: string) => board.lists.find((list) => list.id === listId)?.title;
  const cardTitle = (cardId: string | null) =>
    cardId
      ? board.lists.flatMap((l) => l.cards).find((card) => card.id === cardId)?.title
      : undefined;
  const items = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <aside
      aria-label="Atividade do board"
      className="flex w-80 shrink-0 flex-col border-l border-black/10 bg-slate-50 dark:border-white/10 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="font-semibold">Atividade</h2>
        <button
          type="button"
          aria-label="Fechar atividade"
          onClick={onClose}
          className={ghostButtonClass}
        >
          <CloseIcon />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isPending && <p className="text-sm text-slate-500">Carregando…</p>}
        <ul className="space-y-3">
          {items.map((activity) => {
            const title = cardTitle(activity.cardId);
            return (
              <li
                key={activity.id}
                className="flex gap-2 text-sm"
                data-testid="board-activity-item"
              >
                <Avatar user={activity.actor} />
                <p className="min-w-0 text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {activity.actor.name}
                  </span>{' '}
                  {activity.actor.type === 'agent' && <AgentBadge />}{' '}
                  {describeActivity(activity, { listTitle }).replace(
                    'este card',
                    title ? `“${title}”` : 'um card',
                  )}
                  <span className="block text-xs text-slate-400">
                    {formatRelative(activity.createdAt)}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
        {hasNextPage && (
          <button
            type="button"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
            className={`${ghostButtonClass} mt-2`}
          >
            {isFetchingNextPage ? 'Carregando…' : 'Mostrar mais'}
          </button>
        )}
      </div>
    </aside>
  );
}
