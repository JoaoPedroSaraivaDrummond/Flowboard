import { useState } from 'react';
import { useBoardMutation } from '../../hooks/useBoard';
import { api } from '../../lib/api';
import type { CardDetail, CustomField } from '../../lib/types';
import { LinkIcon } from '../ui/icons';
import { inputClass } from '../ui/styles';

type Props = { boardId: string; card: CardDetail; fields: CustomField[] };

export function CardCustomFields({ boardId, card, fields }: Props) {
  if (fields.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Este board não tem campos personalizados (crie em “Configurar”).
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <FieldInput
          key={field.id}
          boardId={boardId}
          cardId={card.id}
          field={field}
          value={card.customFieldValues.find((v) => v.fieldId === field.id)?.value ?? ''}
        />
      ))}
    </div>
  );
}

type FieldInputProps = { boardId: string; cardId: string; field: CustomField; value: string };

/** Saves on blur/Enter (text, number, url) or on change (select). */
function FieldInput({ boardId, cardId, field, value }: FieldInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const save = useBoardMutation(
    boardId,
    (next: string) => api.setCustomFieldValue(cardId, field.id, next.trim() || null),
    `Não foi possível salvar “${field.name}”`,
  );
  const commit = () => {
    if (draft !== null && draft !== value) save.mutate(draft);
    setDraft(null);
  };

  const label = (
    <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {field.name}
      {field.type === 'url' && value && (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          title="Abrir link"
          className="text-sky-600 hover:text-sky-800"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </a>
      )}
    </span>
  );

  if (field.type === 'select') {
    return (
      <label className="space-y-1">
        {label}
        <select
          aria-label={field.name}
          className={inputClass}
          value={value}
          onChange={(e) => save.mutate(e.target.value)}
        >
          <option value="">—</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="space-y-1">
      {label}
      <input
        aria-label={field.name}
        type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'}
        step="any"
        placeholder={field.type === 'url' ? 'https://…' : '—'}
        className={inputClass}
        value={draft ?? value}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
}
