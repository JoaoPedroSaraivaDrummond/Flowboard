import { useCardActivity } from '../../hooks/useCard';
import { describeActivity } from '../../lib/activity';
import { formatRelative } from '../../lib/format';
import type { BoardList } from '../../lib/types';
import { AgentBadge } from '../ui/AgentBadge';
import { Avatar } from '../ui/Avatar';
import { ghostButtonClass } from '../ui/styles';

type Props = { boardId: string; cardId: string; lists: BoardList[] };

export function CardActivityFeed({ boardId, cardId, lists }: Props) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } = useCardActivity(
    boardId,
    cardId,
  );
  const listTitle = (listId: string) => lists.find((list) => list.id === listId)?.title;
  const items = data?.pages.flatMap((page) => page.items) ?? [];

  if (isPending) return <p className="text-sm text-slate-500">Carregando…</p>;

  return (
    <div>
      <ul className="space-y-2">
        {items.map((activity) => (
          <li key={activity.id} className="flex items-start gap-2 text-sm">
            <Avatar user={activity.actor} />
            <p className="text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-800 dark:text-slate-100">
                {activity.actor.name}
              </span>{' '}
              {activity.actor.type === 'agent' && <AgentBadge />}{' '}
              {describeActivity(activity, { listTitle })}
              <span className="block text-xs text-slate-400">
                {formatRelative(activity.createdAt)}
              </span>
            </p>
          </li>
        ))}
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
  );
}
