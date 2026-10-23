/** Subset of the Flowboard API response shapes used by the MCP server. */

export type User = { id: string; name: string; email: string; type?: 'human' | 'agent' };
export type LabelRef = { id: string; name: string; color: string };

export type BoardSummary = {
  id: string;
  title: string;
  description: string | null;
  archivedAt: string | null;
};

export type CardSummary = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  labels: LabelRef[];
  assignee: User | null;
  _count: { comments: number; checklistItems: number };
  checklistItems: { done: boolean }[];
  customFieldValues: { fieldId: string; value: string }[];
};

export type ListRules = {
  wipLimit: number | null;
  onEnterMarkDone: boolean;
  onEnterAssigneeId: string | null;
  onEnterLabelId: string | null;
};

export type BoardList = ListRules & {
  id: string;
  boardId: string;
  title: string;
  cards: CardSummary[];
};

export type CustomField = {
  id: string;
  name: string;
  type: 'text' | 'number' | 'select' | 'url';
  options: string[];
};

export type CardTemplate = {
  id: string;
  name: string;
  description: string | null;
  checklist: string[];
};

export type BoardDetail = BoardSummary & {
  labels: LabelRef[];
  lists: BoardList[];
  customFields: CustomField[];
  templates: CardTemplate[];
};

export type ChecklistItem = { id: string; cardId: string; text: string; done: boolean };

export type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; name: string };
};

export type CardDetail = Omit<CardSummary, 'checklistItems' | 'customFieldValues'> & {
  customFieldValues: {
    fieldId: string;
    value: string;
    field: { name: string; type: CustomField['type'] };
  }[];
  createdAt: string;
  updatedAt: string;
  list: { id: string; title: string; boardId: string };
  checklistItems: ChecklistItem[];
  comments: Comment[];
};

export type SearchResult = CardSummary & {
  list: { id: string; title: string; board: { id: string; title: string } };
};

export type Activity = {
  id: string;
  cardId: string | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string; type?: 'human' | 'agent' };
};

export type Page<T> = { items: T[]; nextCursor: string | null };

export type MoveTarget = { beforeId?: string; afterId?: string; index?: number };

export type CardFields = {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  completed?: boolean;
};
