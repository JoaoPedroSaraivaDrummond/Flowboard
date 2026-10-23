import { useState } from 'react';
import type { FormEvent } from 'react';
import { useBoardMutation } from '../../hooks/useBoard';
import { api } from '../../lib/api';
import type { ChecklistItem } from '../../lib/types';
import { EditableText } from '../ui/EditableText';
import { TrashIcon } from '../ui/icons';
import { inputClass, primaryButtonClass } from '../ui/styles';

type Props = { boardId: string; cardId: string; items: ChecklistItem[] };

export function CardChecklist({ boardId, cardId, items }: Props) {
  const [text, setText] = useState('');
  const create = useBoardMutation(boardId, (value: string) =>
    api.createChecklistItem(cardId, value),
  );
  const update = useBoardMutation(
    boardId,
    ({ id, ...data }: { id: string; text?: string; done?: boolean }) =>
      api.updateChecklistItem(id, data),
  );
  const remove = useBoardMutation(boardId, (id: string) => api.deleteChecklistItem(id));

  const done = items.filter((item) => item.done).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    create.mutate(text.trim());
    setText('');
  };

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-9 text-xs text-slate-500 dark:text-slate-400">{percent}%</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className={`h-full rounded-full transition-all ${percent === 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}
      <ul className="space-y-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="group flex items-center gap-2 rounded-md px-1 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <input
              type="checkbox"
              checked={item.done}
              aria-label={`Concluir ${item.text}`}
              onChange={(e) => update.mutate({ id: item.id, done: e.target.checked })}
              className="h-4 w-4 accent-sky-600"
            />
            <div
              className={`min-w-0 flex-1 text-sm ${item.done ? 'text-slate-400 line-through' : ''}`}
            >
              <EditableText
                value={item.text}
                ariaLabel="Texto do item"
                onSave={(value) => update.mutate({ id: item.id, text: value })}
              />
            </div>
            <button
              type="button"
              aria-label="Remover item"
              onClick={() => remove.mutate(item.id)}
              className="rounded p-1 text-slate-400 opacity-0 transition hover:text-rose-600 group-hover:opacity-100"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          className={inputClass}
          placeholder="Adicionar um item"
          aria-label="Novo item do checklist"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className={`${primaryButtonClass} shrink-0`}>
          Adicionar
        </button>
      </form>
    </div>
  );
}
