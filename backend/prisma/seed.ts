import type { CustomFieldType } from '@prisma/client';
import { hashPassword } from '../src/lib/password.js';
import { prisma } from '../src/lib/prisma.js';
import { createBoard } from '../src/services/boards.js';
import { createCard } from '../src/services/cards.js';
import { createCustomField } from '../src/services/custom-fields.js';
import { createLabel } from '../src/services/labels.js';
import { createList, updateList } from '../src/services/lists.js';
import { createCardFromTemplate, createTemplate } from '../src/services/templates.js';

const ADMIN = { name: 'Admin', email: 'admin@flowboard.local', password: 'admin123' };
const AGENT = { name: 'Claude Agent', email: 'claude-agent@flowboard.local' };
const BOARD_TITLE = 'Fluxo de Desenvolvimento';
const LISTS = ['Backlog', 'A Fazer', 'Em Progresso', 'Revisão', 'Concluído'];
const LABELS = [
  { name: 'bug', color: '#ef4444' },
  { name: 'feature', color: '#22c55e' },
  { name: 'chore', color: '#64748b' },
];
const CUSTOM_FIELDS: { name: string; type: CustomFieldType; options?: string[] }[] = [
  { name: 'PR', type: 'url' },
  { name: 'Branch', type: 'text' },
  { name: 'Prioridade', type: 'select', options: ['alta', 'média', 'baixa'] },
  { name: 'Estimativa (h)', type: 'number' },
];
const TEMPLATES = [
  {
    name: 'Bug',
    description:
      '## Passos para reproduzir\n1. \n\n## Comportamento esperado\n\n## Comportamento atual\n',
    checklist: ['Reproduzir o bug', 'Escrever teste que falha', 'Corrigir', 'Abrir PR'],
  },
  {
    name: 'Feature',
    description: '## Contexto\n\n## Critérios de aceite\n- [ ] ',
    checklist: ['Implementar', 'Escrever testes', 'Atualizar documentação', 'Abrir PR'],
  },
];

/** Idempotent: re-running only adds what is missing (safe on an existing database). */
async function main(): Promise<void> {
  const admin = await prisma.user.upsert({
    where: { email: ADMIN.email },
    update: {},
    create: {
      name: ADMIN.name,
      email: ADMIN.email,
      passwordHash: await hashPassword(ADMIN.password),
    },
  });
  // Agents have no usable password: they authenticate with API tokens created by a human.
  const agent = await prisma.user.upsert({
    where: { email: AGENT.email },
    update: { type: 'agent' },
    create: { name: AGENT.name, email: AGENT.email, passwordHash: '!agent', type: 'agent' },
  });
  console.log(`Users: ${admin.email} (human), ${agent.email} (agent)`);

  // Use the services so the seed also produces the corresponding activity log.
  let board = await prisma.board.findFirst({
    where: { title: BOARD_TITLE, createdById: admin.id },
  });
  if (!board) {
    board = await createBoard(admin.id, {
      title: BOARD_TITLE,
      description: 'Board de exemplo do Flowboard.',
    });
    for (const label of LABELS) await createLabel(admin.id, board.id, label);
    for (const title of LISTS) await createList(admin.id, board.id, { title });
    console.log(`Board "${BOARD_TITLE}" created (${board.id})`);
  } else {
    console.log(`Board "${BOARD_TITLE}" exists (${board.id})`);
  }
  const boardId = board.id;

  for (const field of CUSTOM_FIELDS) {
    const exists = await prisma.customField.findFirst({ where: { boardId, name: field.name } });
    if (!exists) await createCustomField(admin.id, boardId, field);
  }
  for (const template of TEMPLATES) {
    const exists = await prisma.cardTemplate.findFirst({ where: { boardId, name: template.name } });
    if (!exists) await createTemplate(admin.id, boardId, template);
  }

  const lists = await prisma.list.findMany({ where: { boardId, archivedAt: null } });
  const listByTitle = (title: string) => lists.find((list) => list.title === title);
  const hasRules = (title: string) => {
    const list = listByTitle(title);
    return (
      !list ||
      list.wipLimit !== null ||
      list.onEnterMarkDone ||
      list.onEnterAssigneeId ||
      list.onEnterLabelId
    );
  };
  // Only configure rules on lists that have none, so manual changes survive re-seeding.
  if (!hasRules('Em Progresso'))
    await updateList(admin.id, listByTitle('Em Progresso')!.id, { wipLimit: 3 });
  if (!hasRules('Revisão')) {
    await updateList(admin.id, listByTitle('Revisão')!.id, { onEnterAssigneeId: admin.id });
  }
  if (!hasRules('Concluído')) {
    await updateList(admin.id, listByTitle('Concluído')!.id, { onEnterMarkDone: true });
  }

  const labels = await prisma.label.findMany({ where: { boardId } });
  const templates = await prisma.cardTemplate.findMany({ where: { boardId } });
  const ensureCard = async (title: string, create: () => Promise<unknown>) => {
    const exists = await prisma.card.findFirst({ where: { title, list: { boardId } } });
    if (!exists) await create();
  };
  const backlog = listByTitle('Backlog');
  const todo = listByTitle('A Fazer');
  if (backlog) {
    await ensureCard('Configurar servidor MCP', () =>
      createCard(admin.id, backlog.id, {
        title: 'Configurar servidor MCP',
        description: 'Expor quadros, listas e cards para o **Claude Code** via MCP.',
        labelIds: labels.filter((l) => l.name === 'feature').map((l) => l.id),
      }),
    );
  }
  if (todo) {
    await ensureCard('Criar interface do quadro', () =>
      createCard(admin.id, todo.id, {
        title: 'Criar interface do quadro',
        description: '- Listas lado a lado\n- Drag and drop de cards',
        assigneeId: admin.id,
        labelIds: labels.filter((l) => l.name === 'feature').map((l) => l.id),
      }),
    );
    const bugTemplate = templates.find((t) => t.name === 'Bug');
    if (bugTemplate) {
      await ensureCard('Data de entrega exibida no fuso errado', () =>
        createCardFromTemplate(admin.id, todo.id, {
          templateId: bugTemplate.id,
          title: 'Data de entrega exibida no fuso errado',
        }),
      );
    }
  }
  console.log('Custom fields, templates, list rules and sample cards ensured');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
