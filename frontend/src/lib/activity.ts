import type { Activity } from './types';

type Context = { listTitle: (listId: string) => string | undefined };

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);

/** Human readable (pt-BR) sentence for an activity entry, without the actor name. */
export function describeActivity(activity: Activity, context: Context): string {
  const payload = activity.payload;
  const list = (key: string) => {
    const id = str(payload[key]);
    return (id && context.listTitle(id)) ?? 'outra lista';
  };
  const changes = (payload.changes ?? {}) as Record<string, unknown>;

  const automations = payload.automations as
    { assigneeId?: string; labelId?: string; markedDone?: boolean } | undefined;
  const automationText = automations
    ? ` (automação: ${[
        automations.markedDone && 'marcado como concluído',
        automations.assigneeId && 'responsável atribuído',
        automations.labelId && 'etiqueta adicionada',
      ]
        .filter(Boolean)
        .join(', ')})`
    : '';

  switch (activity.type) {
    case 'card.created':
      return `criou este card em ${list('listId')}${
        payload.templateName ? ` a partir do template “${str(payload.templateName)}”` : ''
      }${automationText}`;
    case 'card.moved':
      return payload.fromListId === payload.toListId
        ? `reordenou este card em ${list('toListId')}`
        : `moveu este card de ${list('fromListId')} para ${list('toListId')}${automationText}`;
    case 'card.claimed':
      return `pegou este card de ${list('fromListId')} e moveu para ${list('toListId')}${automationText}`;
    case 'card.custom_field_set':
      return payload.value === null
        ? `limpou o campo ${str(payload.name)}`
        : `definiu ${str(payload.name)} = ${str(payload.value)}`;
    case 'card.updated': {
      const fields: string[] = [];
      if ('title' in changes) fields.push('o título');
      if ('description' in changes) fields.push('a descrição');
      if ('dueDate' in changes)
        fields.push(changes.dueDate ? 'a data de entrega' : 'removeu a data');
      if ('assigneeId' in changes)
        fields.push(changes.assigneeId ? 'o responsável' : 'removeu o responsável');
      if ('completed' in changes)
        fields.push(changes.completed ? 'marcou como concluído' : 'reabriu');
      return fields.length ? `alterou ${fields.join(', ')}` : 'atualizou este card';
    }
    case 'card.archived':
      return 'arquivou este card';
    case 'card.restored':
      return 'restaurou este card';
    case 'card.label_added':
      return 'adicionou uma etiqueta';
    case 'card.label_removed':
      return 'removeu uma etiqueta';
    case 'comment.created':
      return 'comentou';
    case 'comment.updated':
      return 'editou um comentário';
    case 'comment.deleted':
      return 'apagou um comentário';
    case 'checklist_item.created':
      return `adicionou “${str(payload.text) ?? 'item'}” ao checklist`;
    case 'checklist_item.updated': {
      const done = changes.done;
      if (done === true) return 'concluiu um item do checklist';
      if (done === false) return 'reabriu um item do checklist';
      return 'editou um item do checklist';
    }
    case 'checklist_item.moved':
      return 'reordenou o checklist';
    case 'checklist_item.deleted':
      return `removeu “${str(payload.text) ?? 'item'}” do checklist`;
    case 'board.created':
      return 'criou o board';
    case 'board.updated':
      return 'atualizou o board';
    case 'board.archived':
      return 'arquivou o board';
    case 'board.restored':
      return 'restaurou o board';
    case 'list.created':
      return `criou a lista “${str(payload.title) ?? ''}”`;
    case 'list.updated': {
      const listName = list('listId');
      if ('title' in changes) return `renomeou a lista para “${str(changes.title)}”`;
      return `alterou as regras da lista ${listName}`;
    }
    case 'list.moved':
      return `reordenou a lista ${list('listId')}`;
    case 'list.archived':
      return `arquivou a lista “${str(payload.title) ?? ''}”`;
    case 'list.restored':
      return `restaurou a lista “${str(payload.title) ?? ''}”`;
    case 'label.created':
      return `criou a etiqueta “${str(payload.name) ?? ''}”`;
    case 'label.updated':
      return 'editou uma etiqueta';
    case 'label.deleted':
      return `excluiu a etiqueta “${str(payload.name) ?? ''}”`;
    case 'custom_field.created':
      return `criou o campo “${str(payload.name) ?? ''}”`;
    case 'custom_field.updated':
      return 'editou um campo personalizado';
    case 'custom_field.deleted':
      return `excluiu o campo “${str(payload.name) ?? ''}”`;
    case 'template.created':
      return `criou o template “${str(payload.name) ?? ''}”`;
    case 'template.updated':
      return `editou o template “${str(payload.name) ?? ''}”`;
    case 'template.deleted':
      return `excluiu o template “${str(payload.name) ?? ''}”`;
    default:
      return activity.type;
  }
}
