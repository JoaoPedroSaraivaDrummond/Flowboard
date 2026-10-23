import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { AgentBadge } from '../components/ui/AgentBadge';
import { Avatar } from '../components/ui/Avatar';
import { TrashIcon } from '../components/ui/icons';
import {
  ghostButtonClass,
  inputClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/ui/styles';
import { useUsers } from '../hooks/useCard';
import { api } from '../lib/api';
import { useCurrentUser } from '../lib/auth';
import { formatDateTime, formatRelative } from '../lib/format';
import { queryKeys } from '../lib/query-keys';
import { useToast } from '../lib/toast';
import type { CreatedApiToken, User } from '../lib/types';

export function SettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold">Configurações</h1>
        <ApiTokensSection />
      </div>
    </div>
  );
}

function ApiTokensSection() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: me } = useCurrentUser();
  const { data: users } = useUsers();
  const agents = users?.filter((user) => user.type === 'agent') ?? [];
  // Whose tokens we're managing: yourself, or an agent user (agents can't log in to do it).
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const owner: User | undefined = ownerId ? agents.find((a) => a.id === ownerId) : me;
  const [name, setName] = useState('');
  const [created, setCreated] = useState<CreatedApiToken | null>(null);

  const tokensKey = [...queryKeys.tokens, ownerId ?? 'me'] as const;
  const { data: tokens, isPending } = useQuery({
    queryKey: tokensKey,
    queryFn: () => api.listTokens(ownerId ?? undefined),
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.tokens });

  const createToken = useMutation({
    mutationFn: (tokenName: string) => api.createToken(tokenName, ownerId ?? undefined),
    onSuccess: (token) => {
      setCreated(token);
      setName('');
      void invalidate();
    },
    onError: (error) => toast.error(`Não foi possível criar o token: ${error.message}`),
  });

  const revokeToken = useMutation({
    mutationFn: api.deleteToken,
    onSuccess: () => {
      toast.success('Token revogado');
      void invalidate();
    },
    onError: (error) => toast.error(`Não foi possível revogar o token: ${error.message}`),
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) createToken.mutate(name.trim());
  };

  const ownerButton = (id: string | null, label: ReactNode) => (
    <button
      type="button"
      key={id ?? 'me'}
      onClick={() => {
        setOwnerId(id);
        setCreated(null);
      }}
      aria-pressed={ownerId === id}
      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
        ownerId === id
          ? 'bg-sky-600 text-white'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-lg font-semibold">API tokens</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Tokens para agentes como o Claude Code acessarem a API com{' '}
        <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
          Authorization: Bearer fb_…
        </code>
        . Use um token de um <strong>usuário agente</strong> (ex.: Claude Agent) para que as ações
        do Claude apareçam com o selo de agente na atividade.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Dono dos tokens">
        {ownerButton(null, 'Seus tokens')}
        {agents.map((agent) =>
          ownerButton(
            agent.id,
            <>
              <Avatar user={agent} /> {agent.name}
            </>,
          ),
        )}
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <input
          className={inputClass}
          placeholder={`Nome do token${owner ? ` para ${owner.name}` : ''} (ex.: Claude Code)`}
          aria-label="Nome do token"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className={`${primaryButtonClass} shrink-0`}
          disabled={createToken.isPending}
        >
          Criar token
        </button>
      </form>

      {created && <NewTokenNotice token={created} onDismiss={() => setCreated(null)} />}

      <ul className="mt-6 divide-y divide-slate-200 dark:divide-slate-700">
        {isPending && <li className="py-3 text-sm text-slate-500">Carregando…</li>}
        {tokens?.length === 0 && (
          <li className="py-3 text-sm text-slate-500 dark:text-slate-400">Nenhum token criado.</li>
        )}
        {tokens?.map((token) => (
          <li key={token.id} className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="font-medium">
                {token.name} {token.user.type === 'agent' && <AgentBadge />}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Criado em {formatDateTime(token.createdAt)} ·{' '}
                {token.lastUsedAt
                  ? `último uso ${formatRelative(token.lastUsedAt)}`
                  : 'nunca usado'}
              </p>
            </div>
            <button
              type="button"
              className={`${ghostButtonClass} text-rose-600 dark:text-rose-400`}
              onClick={() => {
                if (
                  window.confirm(
                    `Revogar o token "${token.name}"? Agentes usando-o perderão acesso.`,
                  )
                ) {
                  revokeToken.mutate(token.id);
                }
              }}
            >
              <TrashIcon /> Revogar
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewTokenNotice({ token, onDismiss }: { token: CreatedApiToken; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/40">
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        Token “{token.name}” criado para {token.user.name}. Copie agora — ele não será exibido
        novamente.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          readOnly
          aria-label="Novo token"
          value={token.token}
          onFocus={(e) => e.target.select()}
          className={`${inputClass} font-mono`}
        />
        <button type="button" onClick={copy} className={`${primaryButtonClass} shrink-0`}>
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
        <button type="button" onClick={onDismiss} className={`${secondaryButtonClass} shrink-0`}>
          Fechar
        </button>
      </div>
    </div>
  );
}
