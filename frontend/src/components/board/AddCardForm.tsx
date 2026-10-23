import { useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useBoardMutation } from '../../hooks/useBoard';
import { api } from '../../lib/api';
import type { CardTemplate } from '../../lib/types';
import { CloseIcon, PlusIcon } from '../ui/icons';
import { ghostButtonClass, primaryButtonClass } from '../ui/styles';

type Props = { boardId: string; listId: string; templates: CardTemplate[] };

/** Inline "add card" at the bottom of a column, optionally from a template. Stays open to add several. */
export function AddCardForm({ boardId, listId, templates }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [templateId, setTemplateId] = useState('');
  const createCard = useBoardMutation(
    boardId,
    ({ cardTitle, template }: { cardTitle: string; template: string }) =>
      template
        ? api.createCardFromTemplate(listId, template, cardTitle || undefined)
        : api.createCard(listId, cardTitle),
    'Não foi possível criar o card',
  );

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    const value = title.trim();
    if (!value && !templateId) return;
    createCard.mutate({ cardTitle: value, template: templateId });
    setTitle('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
    if (event.key === 'Escape') setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${ghostButtonClass} w-full justify-start`}
      >
        <PlusIcon /> Adicionar card
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <textarea
        autoFocus
        rows={2}
        aria-label="Título do card"
        placeholder={
          templateId
            ? 'Título (opcional: usa o nome do template)'
            : 'Insira um título para este card…'
        }
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full resize-none rounded-lg bg-white px-3 py-2 text-sm shadow-sm outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-sky-500 dark:bg-slate-700 dark:text-slate-100"
      />
      {templates.length > 0 && (
        <select
          aria-label="Template"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full rounded-md bg-white px-2 py-1.5 text-xs ring-1 ring-black/10 dark:bg-slate-700 dark:text-slate-100"
        >
          <option value="">Sem template</option>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              Template: {template.name}
            </option>
          ))}
        </select>
      )}
      <div className="flex items-center gap-1">
        <button type="submit" className={primaryButtonClass}>
          Adicionar card
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
