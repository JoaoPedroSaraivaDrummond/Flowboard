import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { PlusIcon } from '../components/ui/icons';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui/styles';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';
import { useToast } from '../lib/toast';

const TILE_GRADIENTS = [
  'from-sky-500 to-blue-700',
  'from-violet-500 to-fuchsia-700',
  'from-emerald-500 to-teal-700',
  'from-amber-500 to-orange-700',
  'from-rose-500 to-pink-700',
];

export function BoardsPage() {
  const {
    data: boards,
    isPending,
    error,
  } = useQuery({
    queryKey: queryKeys.boards,
    queryFn: api.listBoards,
  });

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-6">
        <h1 className="mb-6 text-2xl font-semibold">Seus boards</h1>
        {isPending && <p className="text-slate-500">Carregando…</p>}
        {error && <p className="text-rose-600">Erro ao carregar boards: {error.message}</p>}
        {boards && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {boards.map((board, index) => (
              <li key={board.id}>
                <Link
                  to={`/boards/${board.id}`}
                  className={`flex h-28 flex-col justify-between rounded-lg bg-gradient-to-br p-4 text-white shadow transition hover:shadow-lg hover:brightness-110 ${
                    TILE_GRADIENTS[index % TILE_GRADIENTS.length]
                  }`}
                >
                  <span className="line-clamp-2 font-semibold">{board.title}</span>
                  {board.description && (
                    <span className="line-clamp-1 text-xs text-white/80">{board.description}</span>
                  )}
                </Link>
              </li>
            ))}
            <li>
              <CreateBoardTile />
            </li>
          </ul>
        )}
      </div>
    </div>
  );
}

function CreateBoardTile() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const createBoard = useMutation({
    mutationFn: api.createBoard,
    onSuccess: (board) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
      navigate(`/boards/${board.id}`);
    },
    onError: (error) => toast.error(`Não foi possível criar o board: ${error.message}`),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (title.trim()) createBoard.mutate({ title: title.trim() });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-28 w-full items-center justify-center gap-2 rounded-lg bg-slate-200 text-sm font-medium text-slate-700 transition hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <PlusIcon /> Criar novo board
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex h-28 flex-col justify-between rounded-lg bg-white p-3 shadow dark:bg-slate-800"
    >
      <input
        autoFocus
        className={inputClass}
        placeholder="Título do board"
        aria-label="Título do board"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      />
      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClass} disabled={createBoard.isPending}>
          Criar
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
