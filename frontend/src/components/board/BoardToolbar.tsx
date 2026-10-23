import { useEffect, useRef, useState } from 'react';
import { useUsers } from '../../hooks/useCard';
import { EMPTY_FILTERS, hasActiveFilters, type BoardFilters } from '../../lib/board-filter';
import type { Label } from '../../lib/types';
import { ActivityIcon, CloseIcon, FilterIcon, SettingsIcon } from '../ui/icons';
import { LabelChip } from '../ui/LabelChip';

type Props = {
  filters: BoardFilters;
  onFiltersChange: (filters: BoardFilters) => void;
  labels: Label[];
  visibleCount: number;
  totalCount: number;
  activityOpen: boolean;
  onToggleActivity: () => void;
  onOpenSettings: () => void;
};

const toolbarButton =
  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-white transition hover:bg-white/20';
const toolbarInput =
  'rounded-md border-0 bg-white/20 px-2.5 py-1.5 text-sm text-white placeholder-white/70 outline-none ring-white/60 focus:bg-white/30 focus:ring-2';

export function BoardToolbar(props: Props) {
  const { filters, onFiltersChange, labels } = props;
  const { data: users } = useUsers();
  const [labelsOpen, setLabelsOpen] = useState(false);
  const set = (patch: Partial<BoardFilters>) => onFiltersChange({ ...filters, ...patch });
  const active = hasActiveFilters(filters);

  // The text box keeps local state and is written to the URL debounced: driving a controlled input
  // straight from the URL drops keystrokes, because router navigations run as transitions.
  const [text, setText] = useState(filters.text);
  const lastSentText = useRef(filters.text);
  useEffect(() => {
    if (text === filters.text) return;
    const timer = window.setTimeout(() => {
      lastSentText.current = text;
      onFiltersChange({ ...filters, text });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [text, filters, onFiltersChange]);
  useEffect(() => {
    // Only adopt URL changes that didn't come from this box (e.g. "Limpar", back button).
    if (filters.text !== lastSentText.current) {
      lastSentText.current = filters.text;
      setText(filters.text);
    }
  }, [filters.text]);

  const toggleLabel = (labelId: string) =>
    set({
      labelIds: filters.labelIds.includes(labelId)
        ? filters.labelIds.filter((id) => id !== labelId)
        : [...filters.labelIds, labelId],
    });

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="board-toolbar">
      <FilterIcon className="h-4 w-4 text-white/80" />
      <input
        type="search"
        aria-label="Filtrar por texto"
        placeholder="Filtrar cards…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={`${toolbarInput} w-40`}
      />
      <div className="relative">
        <button
          type="button"
          aria-label="Filtrar por etiqueta"
          onClick={() => setLabelsOpen((open) => !open)}
          className={`${toolbarButton} ${filters.labelIds.length ? 'bg-white/25' : ''}`}
        >
          Etiquetas{filters.labelIds.length ? ` (${filters.labelIds.length})` : ''}
        </button>
        {labelsOpen && (
          <div className="absolute left-0 z-30 mt-1 w-48 space-y-1 rounded-lg bg-white p-2 shadow-xl ring-1 ring-black/10 dark:bg-slate-800">
            {labels.map((label) => (
              <label
                key={label.id}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <input
                  type="checkbox"
                  checked={filters.labelIds.includes(label.id)}
                  onChange={() => toggleLabel(label.id)}
                  className="accent-sky-600"
                />
                <LabelChip label={label} />
              </label>
            ))}
          </div>
        )}
      </div>
      <select
        aria-label="Filtrar por responsável"
        value={filters.assignee ?? ''}
        onChange={(e) => set({ assignee: e.target.value || null })}
        className={`${toolbarInput} [&>option]:text-slate-900`}
      >
        <option value="">Qualquer responsável</option>
        <option value="none">Sem responsável</option>
        {users?.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name}
            {user.type === 'agent' ? ' 🤖' : ''}
          </option>
        ))}
      </select>
      <label className={`${toolbarButton} cursor-pointer ${filters.onlyMine ? 'bg-white/25' : ''}`}>
        <input
          type="checkbox"
          checked={filters.onlyMine}
          onChange={(e) => set({ onlyMine: e.target.checked })}
          className="accent-sky-300"
        />
        Só meus cards
      </label>
      {active && (
        <>
          <span className="text-xs text-white/80">
            {props.visibleCount} de {props.totalCount} cards
          </span>
          <button
            type="button"
            onClick={() => onFiltersChange(EMPTY_FILTERS)}
            className={toolbarButton}
          >
            <CloseIcon className="h-3.5 w-3.5" /> Limpar
          </button>
        </>
      )}
      <div className="ml-auto flex gap-1">
        <button
          type="button"
          onClick={props.onToggleActivity}
          className={`${toolbarButton} ${props.activityOpen ? 'bg-white/25' : ''}`}
        >
          <ActivityIcon /> Atividade
        </button>
        <button type="button" onClick={props.onOpenSettings} className={toolbarButton}>
          <SettingsIcon /> Configurar
        </button>
      </div>
    </div>
  );
}
