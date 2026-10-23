import type { LabelRef } from '../../lib/types';

export function LabelChip({ label, compact = false }: { label: LabelRef; compact?: boolean }) {
  return (
    <span
      title={label.name}
      style={{ backgroundColor: label.color }}
      className={`inline-flex items-center rounded font-semibold text-white ${
        compact ? 'h-2 w-10' : 'px-2 py-0.5 text-xs'
      }`}
    >
      {compact ? null : label.name}
    </span>
  );
}
