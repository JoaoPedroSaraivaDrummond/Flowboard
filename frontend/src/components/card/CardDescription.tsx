import { useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { primaryButtonClass, secondaryButtonClass } from '../ui/styles';

type Props = { value: string | null; onSave: (value: string | null) => void; saving: boolean };

export function CardDescription({ value, onSave, saving }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');

  if (draft === null) {
    return value ? (
      <div
        role="button"
        tabIndex={0}
        title="Clique para editar"
        onClick={() => setDraft(value)}
        onKeyDown={(e) => e.key === 'Enter' && setDraft(value)}
        className="prose prose-sm max-w-none cursor-pointer rounded-md p-2 hover:bg-slate-100 dark:prose-invert dark:hover:bg-slate-800"
      >
        <Markdown remarkPlugins={[remarkGfm]}>{value}</Markdown>
      </div>
    ) : (
      <button
        type="button"
        onClick={() => setDraft('')}
        className="w-full rounded-md bg-slate-100 p-3 text-left text-sm text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
      >
        Adicionar uma descrição mais detalhada (Markdown)…
      </button>
    );
  }

  const tabClass = (current: 'write' | 'preview') =>
    `rounded-md px-2 py-1 text-xs font-medium ${
      tab === current
        ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white'
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
    }`;

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <button type="button" className={tabClass('write')} onClick={() => setTab('write')}>
          Editar
        </button>
        <button type="button" className={tabClass('preview')} onClick={() => setTab('preview')}>
          Visualizar
        </button>
      </div>
      {tab === 'write' ? (
        <textarea
          autoFocus
          rows={8}
          aria-label="Descrição"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Markdown: **negrito**, listas, `código`, - [ ] tarefas…"
          className="w-full rounded-md border border-slate-300 bg-white p-3 font-mono text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-800"
        />
      ) : (
        <div className="prose prose-sm min-h-24 max-w-none rounded-md border border-slate-200 p-3 dark:prose-invert dark:border-slate-700">
          {draft.trim() ? (
            <Markdown remarkPlugins={[remarkGfm]}>{draft}</Markdown>
          ) : (
            <p className="text-slate-400">Nada para visualizar.</p>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          className={primaryButtonClass}
          onClick={() => {
            onSave(draft.trim() ? draft : null);
            setDraft(null);
            setTab('write');
          }}
        >
          Salvar
        </button>
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={() => {
            setDraft(null);
            setTab('write');
          }}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
