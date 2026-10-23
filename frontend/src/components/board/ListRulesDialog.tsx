import { useState } from 'react';
import type { FormEvent } from 'react';
import { useBoardMutation } from '../../hooks/useBoard';
import { useUsers } from '../../hooks/useCard';
import { api } from '../../lib/api';
import type { BoardList, Label } from '../../lib/types';
import { Dialog } from '../ui/Dialog';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../ui/styles';

type Props = { boardId: string; list: BoardList; labels: Label[]; onClose: () => void };

/** WIP limit and on-enter automations of a list. */
export function ListRulesDialog({ boardId, list, labels, onClose }: Props) {
  const { data: users } = useUsers();
  const [wipLimit, setWipLimit] = useState(list.wipLimit ? String(list.wipLimit) : '');
  const [markDone, setMarkDone] = useState(list.onEnterMarkDone);
  const [assigneeId, setAssigneeId] = useState(list.onEnterAssigneeId ?? '');
  const [labelId, setLabelId] = useState(list.onEnterLabelId ?? '');
  const save = useBoardMutation(
    boardId,
    () =>
      api.updateList(list.id, {
        wipLimit: wipLimit ? Number(wipLimit) : null,
        onEnterMarkDone: markDone,
        onEnterAssigneeId: assigneeId || null,
        onEnterLabelId: labelId || null,
      }),
    'Não foi possível salvar as regras',
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate(undefined, { onSuccess: onClose });
  };

  return (
    <Dialog title={`Regras da lista “${list.title}”`} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-5">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Limite de WIP</span>
          <input
            type="number"
            min={1}
            className={inputClass}
            placeholder="Sem limite"
            value={wipLimit}
            onChange={(e) => setWipLimit(e.target.value)}
          />
          <span className="block text-xs text-slate-500 dark:text-slate-400">
            Bloqueia mover ou criar cards além desse número (atualmente {list.cards.length}).
          </span>
        </label>

        <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
          <legend className="px-1 text-sm font-medium">Quando um card entrar nesta lista</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={markDone}
              onChange={(e) => setMarkDone(e.target.checked)}
              className="h-4 w-4 accent-sky-600"
            />
            Marcar como concluído
          </label>
          <label className="block space-y-1 text-sm">
            <span>Atribuir a</span>
            <select
              className={inputClass}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Não alterar o responsável</option>
              {users?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                  {user.type === 'agent' ? ' (agente)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>Adicionar etiqueta</span>
            <select
              className={inputClass}
              value={labelId}
              onChange={(e) => setLabelId(e.target.value)}
            >
              <option value="">Nenhuma</option>
              {labels.map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
            </select>
          </label>
        </fieldset>

        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className={primaryButtonClass} disabled={save.isPending}>
            Salvar regras
          </button>
        </div>
      </form>
    </Dialog>
  );
}
