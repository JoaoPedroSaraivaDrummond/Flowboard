import { useState } from 'react';
import type { KeyboardEvent } from 'react';

type EditableTextProps = {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  inputClassName?: string;
  ariaLabel: string;
};

/** Click to edit; Enter or blur saves, Escape cancels. Empty values are ignored. */
export function EditableText({
  value,
  onSave,
  className,
  inputClassName,
  ariaLabel,
}: EditableTextProps) {
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    const next = draft?.trim();
    setDraft(null);
    if (next && next !== value) onSave(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation(); // keep dnd-kit keyboard sensor out of text editing
    if (event.key === 'Enter') commit();
    if (event.key === 'Escape') setDraft(null);
  };

  if (draft !== null) {
    return (
      <input
        autoFocus
        aria-label={ariaLabel}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        onPointerDown={(event) => event.stopPropagation()}
        className={`w-full rounded px-1.5 py-0.5 outline-none ring-2 ring-sky-500 dark:bg-slate-900 ${inputClassName ?? ''}`}
      />
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => setDraft(value)}
      className={`w-full cursor-text truncate rounded px-1.5 py-0.5 text-left hover:bg-black/5 dark:hover:bg-white/10 ${className ?? ''}`}
    >
      {value}
    </button>
  );
}
