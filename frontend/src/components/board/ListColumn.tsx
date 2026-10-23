import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { useBoardMutation } from '../../hooks/useBoard';
import { api } from '../../lib/api';
import { hasListRules } from '../../lib/board-ops';
import type { BoardDetail, BoardList } from '../../lib/types';
import { EditableText } from '../ui/EditableText';
import { ArchiveIcon, BoltIcon, SettingsIcon } from '../ui/icons';
import { AddCardForm } from './AddCardForm';
import { CardTile, SortableCard } from './CardTile';
import { ListRulesDialog } from './ListRulesDialog';

const columnClass =
  'flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-slate-100 shadow-sm dark:bg-slate-800';

type ListColumnProps = {
  list: BoardList;
  board: BoardDetail;
  /** Active cards in the list ignoring filters (WIP is about the real count). */
  totalCards: number;
  onOpenCard: (cardId: string) => void;
};

const headerButtonClass =
  'shrink-0 rounded p-1 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200';

/** Sortable column: the header is the drag handle for the list, the body holds sortable cards. */
export function ListColumn({ list, board, totalCards, onOpenCard }: ListColumnProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: list.id,
    data: { type: 'list' },
  });
  const [rulesOpen, setRulesOpen] = useState(false);
  const renameList = useBoardMutation(board.id, (title: string) =>
    api.updateList(list.id, { title }),
  );
  const archiveList = useBoardMutation(board.id, () => api.archiveList(list.id));
  const atLimit = list.wipLimit !== null && totalCards >= list.wipLimit;
  const stop = {
    onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  };

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`${columnClass} ${isDragging ? 'opacity-40' : ''} ${atLimit ? 'ring-2 ring-amber-400' : ''}`}
      aria-label={`Lista ${list.title}`}
      data-testid="list-column"
      data-list-id={list.id}
    >
      <header
        {...attributes}
        {...listeners}
        className="flex cursor-grab items-center gap-1 px-2 pb-1 pt-2 active:cursor-grabbing"
      >
        <EditableText
          value={list.title}
          onSave={(title) => renameList.mutate(title)}
          ariaLabel="Título da lista"
          className="text-sm font-semibold text-slate-700 dark:text-slate-200"
          inputClassName="text-sm font-semibold"
        />
        {hasListRules(list) && (
          <span title="Esta lista tem automações" className="shrink-0 text-amber-500">
            <BoltIcon className="h-3.5 w-3.5" />
          </span>
        )}
        <span
          data-testid="list-count"
          title={list.wipLimit ? `Limite de WIP: ${list.wipLimit}` : undefined}
          className={`shrink-0 rounded px-1 text-xs ${
            atLimit ? 'bg-amber-400 font-semibold text-amber-950' : 'text-slate-400'
          }`}
        >
          {list.wipLimit ? `${totalCards}/${list.wipLimit}` : totalCards}
        </span>
        <button
          type="button"
          title="Regras da lista"
          aria-label="Regras da lista"
          {...stop}
          onClick={() => setRulesOpen(true)}
          className={headerButtonClass}
        >
          <SettingsIcon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Arquivar lista"
          aria-label="Arquivar lista"
          {...stop}
          onClick={() => {
            if (window.confirm(`Arquivar a lista "${list.title}"?`)) archiveList.mutate(undefined);
          }}
          className={headerButtonClass}
        >
          <ArchiveIcon className="h-3.5 w-3.5" />
        </button>
      </header>

      <SortableContext
        items={list.cards.map((card) => card.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex min-h-2 flex-1 flex-col gap-2 overflow-y-auto px-2 py-1">
          {list.cards.map((card) => (
            <SortableCard
              key={card.id}
              card={card}
              fields={board.customFields}
              onOpen={onOpenCard}
            />
          ))}
        </div>
      </SortableContext>

      <div className="p-2">
        <AddCardForm boardId={board.id} listId={list.id} templates={board.templates} />
      </div>
      {rulesOpen && (
        <ListRulesDialog
          boardId={board.id}
          list={list}
          labels={board.labels}
          onClose={() => setRulesOpen(false)}
        />
      )}
    </section>
  );
}

/** Static preview of a column shown in the drag overlay. */
export function ListColumnPreview({ list, board }: { list: BoardList; board: BoardDetail }) {
  return (
    <section className={`${columnClass} rotate-2 ring-2 ring-sky-500`}>
      <header className="px-3.5 pb-1 pt-2.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {list.title}
      </header>
      <div className="flex flex-col gap-2 overflow-hidden px-2 py-1 pb-3">
        {list.cards.map((card) => (
          <CardTile key={card.id} card={card} fields={board.customFields} />
        ))}
      </div>
    </section>
  );
}
