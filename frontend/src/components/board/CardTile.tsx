import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { dueStatus, formatShortDate } from '../../lib/format';
import type { CardSummary, CustomField } from '../../lib/types';
import { Avatar } from '../ui/Avatar';
import {
  CheckIcon,
  CheckSquareIcon,
  ClockIcon,
  CommentIcon,
  DescriptionIcon,
  LinkIcon,
} from '../ui/icons';
import { LabelChip } from '../ui/LabelChip';

const DUE_CLASSES = {
  overdue: 'bg-rose-600 text-white',
  soon: 'bg-amber-400 text-amber-950',
  later: 'text-slate-500 dark:text-slate-400',
};

/** Compact custom field value: URLs become a link chip showing the host/path tail. */
function FieldChip({ field, value }: { field: CustomField; value: string }) {
  if (field.type === 'url') {
    const short = value.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
    return (
      <a
        href={value}
        target="_blank"
        rel="noreferrer"
        title={`${field.name}: ${value}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        className="inline-flex max-w-full items-center gap-1 truncate rounded bg-sky-100 px-1.5 py-0.5 text-sky-800 hover:underline dark:bg-sky-900/50 dark:text-sky-200"
      >
        <LinkIcon className="h-3 w-3 shrink-0" />
        <span className="font-medium">{field.name}</span>
        <span className="truncate">{short.length > 28 ? `…${short.slice(-26)}` : short}</span>
      </a>
    );
  }
  return (
    <span
      title={`${field.name}: ${value}`}
      className="inline-flex max-w-full items-center gap-1 truncate rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-600"
    >
      <span className="text-slate-500 dark:text-slate-300">{field.name}:</span>
      <span className="truncate font-medium text-slate-700 dark:text-slate-100">{value}</span>
    </span>
  );
}

type CardTileProps = { card: CardSummary; fields?: CustomField[]; dragging?: boolean };

/** Visual card; also used inside the drag overlay. */
export function CardTile({ card, fields = [], dragging = false }: CardTileProps) {
  const checklistTotal = card.checklistItems.length;
  const checklistDone = card.checklistItems.filter((item) => item.done).length;
  const checklistComplete = checklistTotal > 0 && checklistDone === checklistTotal;
  const values = card.customFieldValues
    .map((value) => ({ ...value, field: fields.find((f) => f.id === value.fieldId) }))
    .filter((value): value is typeof value & { field: CustomField } => Boolean(value.field));

  return (
    <div
      className={`rounded-lg bg-white px-3 py-2 text-sm shadow-sm ring-1 ring-black/5 transition-shadow dark:bg-slate-700 dark:ring-white/5 ${
        dragging ? 'rotate-2 shadow-xl ring-2 ring-sky-500' : 'hover:ring-2 hover:ring-sky-500'
      }`}
    >
      {card.labels.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {card.labels.map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </div>
      )}
      <p
        className={`break-words ${
          card.completedAt
            ? 'text-slate-500 line-through decoration-slate-400 dark:text-slate-400'
            : 'text-slate-800 dark:text-slate-100'
        }`}
      >
        {card.title}
      </p>
      {values.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 text-xs">
          {values.map((value) => (
            <FieldChip key={value.fieldId} field={value.field} value={value.value} />
          ))}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        {card.completedAt && (
          <span
            title="Concluído"
            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 font-medium text-white"
          >
            <CheckIcon className="h-3 w-3" /> Concluído
          </span>
        )}
        {card.dueDate && !card.completedAt && (
          <span
            title="Data de entrega"
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${DUE_CLASSES[dueStatus(card.dueDate)]}`}
          >
            <ClockIcon className="h-3 w-3" /> {formatShortDate(card.dueDate)}
          </span>
        )}
        {card.description && (
          <span title="Possui descrição">
            <DescriptionIcon className="h-3.5 w-3.5" />
          </span>
        )}
        {card._count.comments > 0 && (
          <span title="Comentários" className="inline-flex items-center gap-1">
            <CommentIcon className="h-3 w-3" /> {card._count.comments}
          </span>
        )}
        {checklistTotal > 0 && (
          <span
            title="Checklist"
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${
              checklistComplete ? 'bg-emerald-600 text-white' : ''
            }`}
          >
            <CheckSquareIcon className="h-3 w-3" /> {checklistDone}/{checklistTotal}
          </span>
        )}
        {card.assignee && (
          <span className="ml-auto">
            <Avatar user={card.assignee} />
          </span>
        )}
      </div>
    </div>
  );
}

type SortableCardProps = {
  card: CardSummary;
  fields: CustomField[];
  onOpen: (cardId: string) => void;
};

export function SortableCard({ card, fields, onOpen }: SortableCardProps) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card' },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={isDragging ? 'opacity-40' : ''}
      data-testid="card-tile"
      data-card-id={card.id}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card.id)}
    >
      <CardTile card={card} fields={fields} />
    </div>
  );
}
