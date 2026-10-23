import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Toast = { id: number; kind: 'error' | 'success'; message: string };

type ToastContextValue = {
  error: (message: string) => void;
  success: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_DURATION_MS = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, kind, message }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), TOAST_DURATION_MS);
  }, []);

  const value = useMemo(
    () => ({
      error: (message: string) => push('error', message),
      success: (message: string) => push('success', message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto max-w-sm rounded-lg px-4 py-3 text-sm text-white shadow-lg ${
              toast.kind === 'error' ? 'bg-rose-600' : 'bg-emerald-600'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
