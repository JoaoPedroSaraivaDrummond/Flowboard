const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatShortDate = (iso: string) => dateFormatter.format(new Date(iso));
export const formatDateTime = (iso: string) => dateTimeFormatter.format(new Date(iso));

export function formatRelative(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'agora';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return formatDateTime(iso);
}

export type DueStatus = 'overdue' | 'soon' | 'later';

export function dueStatus(iso: string): DueStatus {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'overdue';
  if (diff < 24 * 60 * 60 * 1000) return 'soon';
  return 'later';
}

/** `<input type="date">` value (local) <-> ISO end of that local day. */
export function toDateInputValue(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromDateInputValue(value: string): string | null {
  return value ? new Date(`${value}T23:59:59`).toISOString() : null;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}
