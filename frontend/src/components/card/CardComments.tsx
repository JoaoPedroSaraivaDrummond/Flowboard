import { useState } from 'react';
import type { FormEvent } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useBoardMutation } from '../../hooks/useBoard';
import { api } from '../../lib/api';
import { useCurrentUser } from '../../lib/auth';
import { formatRelative } from '../../lib/format';
import type { Comment } from '../../lib/types';
import { AgentBadge } from '../ui/AgentBadge';
import { Avatar } from '../ui/Avatar';
import { primaryButtonClass } from '../ui/styles';

type Props = { boardId: string; cardId: string; comments: Comment[] };

export function CardComments({ boardId, cardId, comments }: Props) {
  const { data: me } = useCurrentUser();
  const [body, setBody] = useState('');
  const create = useBoardMutation(boardId, (text: string) => api.createComment(cardId, text));
  const remove = useBoardMutation(boardId, (id: string) => api.deleteComment(id));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!body.trim()) return;
    create.mutate(body.trim());
    setBody('');
  };

  return (
    <div className="space-y-3">
      <form onSubmit={onSubmit} className="space-y-2">
        <textarea
          rows={2}
          aria-label="Novo comentário"
          placeholder="Escreva um comentário (Markdown)…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/30 dark:border-slate-600 dark:bg-slate-800"
        />
        {body.trim() && (
          <button type="submit" className={primaryButtonClass} disabled={create.isPending}>
            Comentar
          </button>
        )}
      </form>
      <ul className="space-y-3">
        {[...comments].reverse().map((comment) => (
          <li key={comment.id} className="flex gap-2">
            <Avatar user={comment.author} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {comment.author.name}
                </span>{' '}
                {comment.author.type === 'agent' && <AgentBadge />} ·{' '}
                {formatRelative(comment.createdAt)}
              </p>
              <div className="prose prose-sm mt-1 max-w-none rounded-md bg-white px-3 py-2 shadow-sm ring-1 ring-black/5 dark:prose-invert dark:bg-slate-800 dark:ring-white/5">
                <Markdown remarkPlugins={[remarkGfm]}>{comment.body}</Markdown>
              </div>
              {me?.id === comment.authorId && (
                <button
                  type="button"
                  onClick={() =>
                    window.confirm('Apagar este comentário?') && remove.mutate(comment.id)
                  }
                  className="mt-1 text-xs text-slate-500 underline-offset-2 hover:text-rose-600 hover:underline"
                >
                  Apagar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
