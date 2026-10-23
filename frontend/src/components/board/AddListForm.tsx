import { useState } from 'react';
import type { FormEvent } from 'react';
import { useBoardMutation } from '../../hooks/useBoard';
import { api } from '../../lib/api';
import { CloseIcon, PlusIcon } from '../ui/icons';
import { ghostButtonClass, inputClass, primaryButtonClass } from '../ui/styles';

export function AddListForm({ boardId }: { boardId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const createList = useBoardMutation(
    boardId,
    (listTitle: string) => api.createList(boardId, listTitle),
    'Não foi possível criar a lista',
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = title.trim();
    if (!value) return;
    createList.mutate(value);
    setTitle('');
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-72 shrink-0 items-center gap-2 rounded-xl bg-white/25 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-white/35 dark:bg-white/10 dark:hover:bg-white/15"
      >
        <PlusIcon /> Adicionar lista
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="w-72 shrink-0 space-y-2 rounded-xl bg-slate-100 p-2 dark:bg-slate-800"
    >
      <input
        autoFocus
        className={inputClass}
        placeholder="Título da lista"
        aria-label="Título da lista"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
      />
      <div className="flex items-center gap-1">
        <button type="submit" className={primaryButtonClass}>
          Adicionar lista
        </button>
        <button
          type="button"
          aria-label="Cancelar"
          onClick={() => setOpen(false)}
          className={ghostButtonClass}
        >
          <CloseIcon />
        </button>
      </div>
    </form>
  );
}
