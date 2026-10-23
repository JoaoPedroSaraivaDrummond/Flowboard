import { useState } from 'react';
import type { FormEvent } from 'react';
import { useBoardMutation } from '../../hooks/useBoard';
import { api } from '../../lib/api';
import type { Label, LabelRef } from '../../lib/types';
import { LabelChip } from '../ui/LabelChip';
import { PlusIcon } from '../ui/icons';
import { inputClass, primaryButtonClass } from '../ui/styles';

const PALETTE = [
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
  '#a855f7',
  '#3b82f6',
  '#06b6d4',
  '#64748b',
];

type Props = { boardId: string; cardId: string; boardLabels: Label[]; selected: LabelRef[] };

export function CardLabelsPicker({ boardId, cardId, boardLabels, selected }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]!);
  const selectedIds = new Set(selected.map((label) => label.id));

  const toggle = useBoardMutation(
    boardId,
    ({ labelId, attach }: { labelId: string; attach: boolean }) =>
      attach ? api.addCardLabel(cardId, labelId) : api.removeCardLabel(cardId, labelId),
  );
  const createLabel = useBoardMutation(boardId, async (data: { name: string; color: string }) => {
    const label = await api.createLabel(boardId, data);
    return api.addCardLabel(cardId, label.id);
  });

  const onCreate = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    createLabel.mutate({ name: name.trim(), color });
    setName('');
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1">
        {selected.map((label) => (
          <LabelChip key={label.id} label={label} />
        ))}
        <button
          type="button"
          aria-label="Editar etiquetas"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-6 w-6 items-center justify-center rounded bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {open && (
        <div className="absolute z-10 mt-2 w-64 space-y-3 rounded-lg bg-white p-3 shadow-xl ring-1 ring-black/10 dark:bg-slate-800 dark:ring-white/10">
          <ul className="space-y-1">
            {boardLabels.map((label) => (
              <li key={label.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(label.id)}
                    onChange={(e) => toggle.mutate({ labelId: label.id, attach: e.target.checked })}
                    className="accent-sky-600"
                  />
                  <span className="flex-1">
                    <LabelChip label={label} />
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <form
            onSubmit={onCreate}
            className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700"
          >
            <input
              className={inputClass}
              placeholder="Nova etiqueta"
              aria-label="Nome da nova etiqueta"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex flex-wrap gap-1">
              {PALETTE.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-label={`Cor ${option}`}
                  onClick={() => setColor(option)}
                  style={{ backgroundColor: option }}
                  className={`h-6 w-6 rounded ${color === option ? 'ring-2 ring-sky-500 ring-offset-2 dark:ring-offset-slate-800' : ''}`}
                />
              ))}
            </div>
            <button type="submit" className={`${primaryButtonClass} w-full`}>
              Criar etiqueta
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
