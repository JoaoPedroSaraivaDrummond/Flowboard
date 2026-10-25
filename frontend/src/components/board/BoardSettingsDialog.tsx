import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useBoardMutation } from '../../hooks/useBoard';
import { api } from '../../lib/api';
import { useCurrentUser } from '../../lib/auth';
import { queryKeys } from '../../lib/query-keys';
import type { BoardDetail, BoardMember, BoardRole, CustomFieldType } from '../../lib/types';
import { Dialog } from '../ui/Dialog';
import { TrashIcon } from '../ui/icons';
import { ghostButtonClass, inputClass, primaryButtonClass } from '../ui/styles';

const FIELD_TYPES: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'select', label: 'Seleção' },
  { value: 'url', label: 'URL' },
];

const FIELD_TYPE_LABEL = Object.fromEntries(FIELD_TYPES.map((t) => [t.value, t.label])) as Record<
  CustomFieldType,
  string
>;

type Props = { board: BoardDetail; onClose: () => void };

export function BoardSettingsDialog({ board, onClose }: Props) {
  const [tab, setTab] = useState<'fields' | 'templates' | 'members'>('fields');
  const tabClass = (current: typeof tab) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      tab === current
        ? 'bg-slate-200 text-slate-900 dark:bg-slate-700 dark:text-white'
        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
    }`;

  return (
    <Dialog title="Configurar board" onClose={onClose} width="lg">
      <div className="mb-4 flex gap-1">
        <button type="button" className={tabClass('fields')} onClick={() => setTab('fields')}>
          Campos personalizados
        </button>
        <button type="button" className={tabClass('templates')} onClick={() => setTab('templates')}>
          Templates de card
        </button>
        <button type="button" className={tabClass('members')} onClick={() => setTab('members')}>
          Membros
        </button>
      </div>
      {tab === 'fields' && <CustomFieldsTab board={board} />}
      {tab === 'templates' && <TemplatesTab board={board} />}
      {tab === 'members' && <MembersTab board={board} />}
    </Dialog>
  );
}

function CustomFieldsTab({ board }: { board: BoardDetail }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [options, setOptions] = useState('');
  const create = useBoardMutation(
    board.id,
    () =>
      api.createCustomField(board.id, {
        name: name.trim(),
        type,
        options:
          type === 'select'
            ? options
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean)
            : undefined,
      }),
    'Não foi possível criar o campo',
  );
  const remove = useBoardMutation(board.id, (fieldId: string) => api.deleteCustomField(fieldId));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate(undefined, {
      onSuccess: () => {
        setName('');
        setOptions('');
      },
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Campos aparecem em todos os cards deste board (ex.: link do PR, branch, prioridade).
      </p>
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {board.customFields.length === 0 && (
          <li className="py-2 text-sm text-slate-500">Nenhum campo.</li>
        )}
        {board.customFields.map((field) => (
          <li key={field.id} className="flex items-center justify-between gap-2 py-2">
            <span className="text-sm">
              <span className="font-medium">{field.name}</span>{' '}
              <span className="text-slate-500 dark:text-slate-400">
                · {FIELD_TYPE_LABEL[field.type]}
                {field.type === 'select' && `: ${field.options.join(', ')}`}
              </span>
            </span>
            <button
              type="button"
              aria-label={`Excluir campo ${field.name}`}
              className={`${ghostButtonClass} text-rose-600`}
              onClick={() =>
                window.confirm(
                  `Excluir o campo "${field.name}" e seus valores em todos os cards?`,
                ) && remove.mutate(field.id)
              }
            >
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          className={inputClass}
          placeholder="Nome do campo"
          aria-label="Nome do campo"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className={inputClass}
          aria-label="Tipo do campo"
          value={type}
          onChange={(e) => setType(e.target.value as CustomFieldType)}
        >
          {FIELD_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button type="submit" className={primaryButtonClass} disabled={create.isPending}>
          Adicionar campo
        </button>
        {type === 'select' && (
          <input
            className={`${inputClass} sm:col-span-3`}
            placeholder="Opções separadas por vírgula (ex.: alta, média, baixa)"
            aria-label="Opções"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
          />
        )}
      </form>
    </div>
  );
}

function TemplatesTab({ board }: { board: BoardDetail }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [checklist, setChecklist] = useState('');
  const create = useBoardMutation(
    board.id,
    () =>
      api.createTemplate(board.id, {
        name: name.trim(),
        description: description.trim() || null,
        checklist: checklist.split('\n'),
      }),
    'Não foi possível criar o template',
  );
  const remove = useBoardMutation(board.id, (templateId: string) => api.deleteTemplate(templateId));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    create.mutate(undefined, {
      onSuccess: () => {
        setName('');
        setDescription('');
        setChecklist('');
      },
    });
  };

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {board.templates.length === 0 && (
          <li className="py-2 text-sm text-slate-500">Nenhum template.</li>
        )}
        {board.templates.map((template) => (
          <li key={template.id} className="flex items-center justify-between gap-2 py-2">
            <span className="text-sm">
              <span className="font-medium">{template.name}</span>{' '}
              <span className="text-slate-500 dark:text-slate-400">
                · {template.checklist.length} itens de checklist
              </span>
            </span>
            <button
              type="button"
              aria-label={`Excluir template ${template.name}`}
              className={`${ghostButtonClass} text-rose-600`}
              onClick={() =>
                window.confirm(`Excluir o template "${template.name}"?`) &&
                remove.mutate(template.id)
              }
            >
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="space-y-2">
        <input
          className={inputClass}
          placeholder="Nome do template (ex.: Bug)"
          aria-label="Nome do template"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <textarea
          rows={4}
          className={`${inputClass} font-mono`}
          placeholder="Descrição em Markdown"
          aria-label="Descrição do template"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <textarea
          rows={4}
          className={inputClass}
          placeholder="Checklist: um item por linha"
          aria-label="Checklist do template"
          value={checklist}
          onChange={(e) => setChecklist(e.target.value)}
        />
        <button type="submit" className={primaryButtonClass} disabled={create.isPending}>
          Criar template
        </button>
      </form>
    </div>
  );
}

const ROLE_LABEL: Record<BoardRole, string> = { owner: 'Dono', member: 'Membro' };

function MembersTab({ board }: { board: BoardDetail }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<BoardRole>('member');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: me } = useCurrentUser();
  const { data: members = [] } = useQuery({
    queryKey: queryKeys.boardMembers(board.id),
    queryFn: () => api.listMembers(board.id),
  });
  const isOwner = members.some((m) => m.user.id === me?.id && m.role === 'owner');
  const ownerCount = members.filter((m) => m.role === 'owner').length;
  // The API refuses to remove the last owner, so don't offer it.
  const canRemove = (member: BoardMember) =>
    (isOwner || member.user.id === me?.id) && !(member.role === 'owner' && ownerCount === 1);

  const add = useBoardMutation(
    board.id,
    () => api.addMember(board.id, email.trim(), role),
    'Não foi possível adicionar o membro',
  );
  const remove = useBoardMutation(
    board.id,
    (userId: string) => api.removeMember(board.id, userId),
    'Não foi possível remover o membro',
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    add.mutate(undefined, { onSuccess: () => setEmail('') });
  };

  const onRemove = (userId: string, name: string) => {
    const leaving = userId === me?.id;
    const question = leaving
      ? 'Sair deste board? Você perde o acesso até ser adicionado de novo.'
      : `Remover ${name} do board?`;
    if (!window.confirm(question)) return;
    remove.mutate(userId, {
      onSuccess: () => {
        if (!leaving) return;
        void queryClient.invalidateQueries({ queryKey: queryKeys.boards });
        navigate('/boards');
      },
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Só os membros veem e editam este board. Agentes agem com o acesso de quem criou o token
        deles.
      </p>
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {members.map((member) => (
          <li key={member.user.id} className="flex items-center justify-between gap-2 py-2">
            <span className="text-sm">
              <span className="font-medium">{member.user.name}</span>{' '}
              <span className="text-slate-500 dark:text-slate-400">
                · {member.user.email} · {ROLE_LABEL[member.role]}
              </span>
            </span>
            {canRemove(member) && (
              <button
                type="button"
                aria-label={
                  member.user.id === me?.id ? 'Sair do board' : `Remover ${member.user.name}`
                }
                className={`${ghostButtonClass} text-rose-600`}
                onClick={() => onRemove(member.user.id, member.user.name)}
              >
                <TrashIcon />
              </button>
            )}
          </li>
        ))}
      </ul>
      {isOwner && (
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
          <input
            type="email"
            className={inputClass}
            placeholder="E-mail de quem já tem conta"
            aria-label="E-mail do membro"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <select
            className={inputClass}
            aria-label="Papel"
            value={role}
            onChange={(e) => setRole(e.target.value as BoardRole)}
          >
            <option value="member">Membro</option>
            <option value="owner">Dono</option>
          </select>
          <button type="submit" className={primaryButtonClass} disabled={add.isPending}>
            Adicionar
          </button>
        </form>
      )}
    </div>
  );
}
