import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { CloseIcon } from './icons';

type DialogProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg';
};

const WIDTHS = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

/** Centered modal; closes on Escape and on backdrop click. */
export function Dialog({ title, onClose, children, width = 'md' }: DialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-10"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full ${WIDTHS[width]} rounded-xl bg-slate-50 p-6 shadow-2xl dark:bg-slate-900`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
