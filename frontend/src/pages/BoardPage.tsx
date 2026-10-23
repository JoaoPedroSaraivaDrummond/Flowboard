import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useNavigate, useParams, useSearchParams } from 'react-router';
import { AddListForm } from '../components/board/AddListForm';
import { BoardActivityPanel } from '../components/board/BoardActivityPanel';
import { BoardSettingsDialog } from '../components/board/BoardSettingsDialog';
import { BoardToolbar } from '../components/board/BoardToolbar';
import { CardTile } from '../components/board/CardTile';
import { ListColumn, ListColumnPreview } from '../components/board/ListColumn';
import { EditableText } from '../components/ui/EditableText';
import { useBoardDetail, useBoardMutation, useMoveCard, useMoveList } from '../hooks/useBoard';
import { useBoardRealtime } from '../hooks/useBoardRealtime';
import { api } from '../lib/api';
import { useCurrentUser } from '../lib/auth';
import {
  filterLists,
  filtersFromParams,
  filtersToParams,
  type BoardFilters,
} from '../lib/board-filter';
import { arrayMove, findListOfCard, moveCardInLists, neighborTarget } from '../lib/board-ops';
import type { BoardList, CardSummary } from '../lib/types';

type ActiveDrag = { type: 'card'; card: CardSummary } | { type: 'list'; list: BoardList };
type DragType = ActiveDrag['type'];

const dragType = (data: { current?: Record<string, unknown> } | undefined) =>
  data?.current?.type as DragType | undefined;

/**
 * Lists only collide with lists. Cards prefer the card under the pointer, then the column under
 * the pointer (so empty columns accept drops).
 */
const collisionDetection: CollisionDetection = (args) => {
  const typeOf = (id: unknown) =>
    dragType(args.droppableContainers.find((container) => container.id === id)?.data);

  if (dragType(args.active.data) === 'list') {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => dragType(c.data) === 'list'),
    });
  }
  const hits = pointerWithin(args);
  const cardHit = hits.find((hit) => typeOf(hit.id) === 'card');
  if (cardHit) return [cardHit];
  const listHit = hits.find((hit) => typeOf(hit.id) === 'list');
  return listHit ? [listHit] : [];
};

export function BoardPage() {
  const { boardId = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: board, isPending, error } = useBoardDetail(boardId);
  const { data: me } = useCurrentUser();
  const moveCard = useMoveCard(boardId);
  const moveList = useMoveList(boardId);
  const updateBoard = useBoardMutation(boardId, (title: string) =>
    api.updateBoard(boardId, { title }),
  );

  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const setFilters = useCallback(
    (next: BoardFilters) => setSearchParams(filtersToParams(next), { replace: true }),
    [setSearchParams],
  );
  const [activityOpen, setActivityOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // While dragging we render from a local copy; cards hop between lists on dragOver.
  const [dragLists, setDragLists] = useState<BoardList[] | null>(null);
  const [active, setActive] = useState<ActiveDrag | null>(null);
  const cardOrigin = useRef<{ listId: string; index: number } | null>(null);
  // Drag handlers read the latest rendered lists (state updated in dragOver may not be in their closure).
  const renderedLists = useRef<BoardList[]>([]);

  useBoardRealtime(boardId, { paused: active !== null });

  // After a drop the local copy is kept until the (optimistic) cache update lands, avoiding a
  // one-frame flash of the old order.
  useEffect(() => {
    if (active === null) setDragLists(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to new board data
  }, [board]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (isPending) return <p className="p-6 text-slate-500">Carregando board…</p>;
  if (error || !board) {
    return (
      <div className="p-6">
        <p className="text-rose-600">Não foi possível carregar o board: {error?.message}</p>
        <Link to="/boards" className="text-sky-600 hover:underline">
          Voltar para os boards
        </Link>
      </div>
    );
  }

  // Filters only hide cards; drag targets are computed from visible neighbours.
  const visibleLists = filterLists(board.lists, filters, me?.id);
  const lists = dragLists ?? visibleLists;
  renderedLists.current = lists;
  const totalCards = (listId: string) =>
    board.lists.find((l) => l.id === listId)?.cards.length ?? 0;
  const visibleCount = visibleLists.reduce((sum, list) => sum + list.cards.length, 0);
  const totalCount = board.lists.reduce((sum, list) => sum + list.cards.length, 0);

  const onDragStart = ({ active: dragged }: DragStartEvent) => {
    const id = String(dragged.id);
    if (dragType(dragged.data) === 'list') {
      const list = visibleLists.find((l) => l.id === id);
      if (list) setActive({ type: 'list', list });
    } else {
      const list = findListOfCard(visibleLists, id);
      const index = list?.cards.findIndex((c) => c.id === id) ?? -1;
      if (!list || index === -1) return;
      cardOrigin.current = { listId: list.id, index };
      setActive({ type: 'card', card: list.cards[index]! });
    }
    setDragLists(visibleLists);
  };

  const onDragOver = ({ active: dragged, over }: DragOverEvent) => {
    if (!over || dragType(dragged.data) !== 'card') return;
    const cardId = String(dragged.id);
    const overId = String(over.id);
    const overType = dragType(over.data);

    setDragLists((current) => {
      if (!current) return current;
      const from = findListOfCard(current, cardId);
      const to =
        overType === 'list'
          ? current.find((l) => l.id === overId)
          : findListOfCard(current, overId);
      if (!from || !to || from.id === to.id) return current;

      let index = to.cards.length;
      if (overType === 'card') {
        const overIndex = to.cards.findIndex((c) => c.id === overId);
        const translated = dragged.rect.current.translated;
        const below = translated !== null && translated.top > over.rect.top + over.rect.height / 2;
        index = overIndex + (below ? 1 : 0);
      }
      return moveCardInLists(current, cardId, to.id, index);
    });
  };

  const finishDrag = (changed: boolean) => {
    setActive(null);
    cardOrigin.current = null;
    if (!changed) setDragLists(null);
  };

  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    const current = renderedLists.current;
    const id = String(dragged.id);

    if (dragType(dragged.data) === 'list') {
      const from = current.findIndex((l) => l.id === id);
      const to = over ? current.findIndex((l) => l.id === over.id) : -1;
      if (from === -1 || to === -1 || from === to) return finishDrag(false);
      const reordered = arrayMove(current, from, to);
      setDragLists(reordered);
      finishDrag(true);
      moveList({
        listId: id,
        index: to,
        target: neighborTarget(
          reordered.map((l) => l.id),
          to,
        ),
      });
      return;
    }

    const list = findListOfCard(current, id);
    const origin = cardOrigin.current;
    if (!list || !origin) return finishDrag(false);
    let cards = list.cards;
    let index = cards.findIndex((c) => c.id === id);
    if (over && dragType(over.data) === 'card' && over.id !== id) {
      const overIndex = cards.findIndex((c) => c.id === over.id);
      if (overIndex !== -1) {
        cards = arrayMove(cards, index, overIndex);
        index = overIndex;
      }
    }
    if (list.id === origin.listId && index === origin.index) return finishDrag(false);

    setDragLists(current.map((l) => (l.id === list.id ? { ...l, cards } : l)));
    finishDrag(true);
    moveCard({
      cardId: id,
      listId: list.id,
      index,
      target: neighborTarget(
        cards.map((c) => c.id),
        index,
      ),
    });
  };

  const onDragCancel = () => finishDrag(false);

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-sky-600 to-indigo-700 dark:from-slate-900 dark:to-slate-950">
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 bg-black/15 px-4 py-2 backdrop-blur-sm">
        <div className="max-w-md">
          <EditableText
            value={board.title}
            onSave={(title) => updateBoard.mutate(title)}
            ariaLabel="Título do board"
            className="text-lg font-bold text-white hover:bg-white/20"
            inputClassName="text-lg font-bold text-slate-900 dark:text-white"
          />
        </div>
        <div className="min-w-0 flex-1">
          <BoardToolbar
            filters={filters}
            onFiltersChange={setFilters}
            labels={board.labels}
            visibleCount={visibleCount}
            totalCount={totalCount}
            activityOpen={activityOpen}
            onToggleActivity={() => setActivityOpen((open) => !open)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div
            className="flex min-h-0 min-w-0 flex-1 items-start gap-3 overflow-x-auto p-4"
            data-testid="board-canvas"
          >
            <SortableContext
              items={lists.map((l) => l.id)}
              strategy={horizontalListSortingStrategy}
            >
              {lists.map((list) => (
                <ListColumn
                  key={list.id}
                  list={list}
                  board={board}
                  totalCards={totalCards(list.id)}
                  onOpenCard={(cardId) =>
                    navigate({
                      pathname: `/boards/${boardId}/cards/${cardId}`,
                      search: searchParams.toString(),
                    })
                  }
                />
              ))}
            </SortableContext>
            <AddListForm boardId={boardId} />
          </div>

          <DragOverlay>
            {active?.type === 'card' && (
              <CardTile card={active.card} fields={board.customFields} dragging />
            )}
            {active?.type === 'list' && (
              <ListColumnPreview
                list={lists.find((l) => l.id === active.list.id) ?? active.list}
                board={board}
              />
            )}
          </DragOverlay>
        </DndContext>
        {activityOpen && (
          <BoardActivityPanel board={board} onClose={() => setActivityOpen(false)} />
        )}
      </div>

      {settingsOpen && <BoardSettingsDialog board={board} onClose={() => setSettingsOpen(false)} />}
      <Outlet />
    </div>
  );
}
