import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useBoardDetail, useBoardMutation } from '../../hooks/useBoard';
import { useCardDetail, useUsers } from '../../hooks/useCard';
import { api } from '../../lib/api';
import { fromDateInputValue, toDateInputValue } from '../../lib/format';
import type { CardFields } from '../../lib/types';
import { EditableText } from '../ui/EditableText';
import {
  ActivityIcon,
  ArchiveIcon,
  CheckIcon,
  TagIcon,
  CheckSquareIcon,
  CloseIcon,
  CommentIcon,
  DescriptionIcon,
} from '../ui/icons';
import { inputClass, secondaryButtonClass } from '../ui/styles';
import { CardActivityFeed } from './CardActivityFeed';
import { CardChecklist } from './CardChecklist';
import { CardCustomFields } from './CardCustomFields';
import { CardComments } from './CardComments';
import { CardDescription } from './CardDescription';
import { CardLabelsPicker } from './CardLabelsPicker';

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        {icon} {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </p>
      {children}
    </div>
  );
}

/** Route element for /boards/:boardId/cards/:cardId, rendered over the board. */
export function CardModal() {
  const { boardId = '', cardId = '' } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  // Keep the board filters (query string) when closing.
  const close = () => navigate({ pathname: `/boards/${boardId}`, search });

  const { data: card, isPending, error } = useCardDetail(boardId, cardId);
  const { data: board } = useBoardDetail(boardId);
  const { data: users } = useUsers();
  const update = useBoardMutation(boardId, (data: CardFields) => api.updateCard(cardId, data));
  const archive = useBoardMutation(boardId, () => api.archiveCard(cardId));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
      ) {
        navigate({ pathname: `/boards/${boardId}`, search });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [boardId, navigate, search]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-10"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={card?.title ?? 'Card'}
        className="relative w-full max-w-3xl rounded-xl bg-slate-50 p-6 shadow-2xl dark:bg-slate-900"
      >
        <button
          type="button"
          aria-label="Fechar"
          onClick={close}
          className="absolute right-3 top-3 rounded-md p-1.5 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800"
        >
          <CloseIcon />
        </button>

        {isPending && <p className="text-slate-500">Carregando…</p>}
        {error && (
          <p className="text-rose-600">Não foi possível carregar o card: {error.message}</p>
        )}

        {card && (
          <div className="space-y-6">
            <div className="pr-8">
              <EditableText
                value={card.title}
                ariaLabel="Título do card"
                onSave={(title) => update.mutate({ title })}
                className="text-xl font-semibold"
                inputClassName="text-xl font-semibold"
              />
              <p className="mt-1 px-1.5 text-sm text-slate-500 dark:text-slate-400">
                na lista <span className="font-medium underline">{card.list.title}</span>
                {card.archivedAt && (
                  <span className="ml-2 rounded bg-amber-200 px-1.5 text-amber-900">arquivado</span>
                )}
              </p>
              <button
                type="button"
                aria-pressed={Boolean(card.completedAt)}
                onClick={() => update.mutate({ completed: !card.completedAt })}
                className={`mt-3 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  card.completedAt
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600'
                }`}
              >
                <CheckIcon /> {card.completedAt ? 'Concluído' : 'Marcar como concluído'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Etiquetas">
                <CardLabelsPicker
                  boardId={boardId}
                  cardId={cardId}
                  boardLabels={board?.labels ?? []}
                  selected={card.labels}
                />
              </Field>
              <Field label="Responsável">
                <select
                  aria-label="Responsável"
                  className={inputClass}
                  value={card.assigneeId ?? ''}
                  onChange={(e) => update.mutate({ assigneeId: e.target.value || null })}
                >
                  <option value="">Ninguém</option>
                  {users?.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                      {user.type === 'agent' ? ' (agente)' : ''}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Data de entrega">
                <input
                  type="date"
                  aria-label="Data de entrega"
                  className={inputClass}
                  value={toDateInputValue(card.dueDate)}
                  onChange={(e) => update.mutate({ dueDate: fromDateInputValue(e.target.value) })}
                />
              </Field>
            </div>

            <Section icon={<TagIcon />} title="Campos personalizados">
              <CardCustomFields boardId={boardId} card={card} fields={board?.customFields ?? []} />
            </Section>

            <Section icon={<DescriptionIcon />} title="Descrição">
              <CardDescription
                value={card.description}
                saving={update.isPending}
                onSave={(description) => update.mutate({ description })}
              />
            </Section>

            <Section icon={<CheckSquareIcon />} title="Checklist">
              <CardChecklist boardId={boardId} cardId={cardId} items={card.checklistItems} />
            </Section>

            <Section icon={<CommentIcon />} title="Comentários">
              <CardComments boardId={boardId} cardId={cardId} comments={card.comments} />
            </Section>

            <Section icon={<ActivityIcon />} title="Atividade">
              <CardActivityFeed boardId={boardId} cardId={cardId} lists={board?.lists ?? []} />
            </Section>

            {!card.archivedAt && (
              <div className="border-t border-slate-200 pt-4 dark:border-slate-700">
                <button
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => {
                    if (!window.confirm('Arquivar este card?')) return;
                    archive.mutate(undefined, { onSuccess: close });
                  }}
                >
                  <ArchiveIcon /> Arquivar card
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
