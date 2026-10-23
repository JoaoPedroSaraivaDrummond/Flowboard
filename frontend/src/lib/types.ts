export type UserType = 'human' | 'agent';

export type User = {
  id: string;
  name: string;
  email: string;
  type: UserType;
  createdAt: string;
};

export type AuthResponse = { user: User; token: string };

export type LabelRef = { id: string; name: string; color: string };
export type Label = LabelRef & { boardId: string };

export type CardSummary = {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  position: number;
  dueDate: string | null;
  assigneeId: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  labels: LabelRef[];
  assignee: User | null;
  _count: { comments: number; checklistItems: number };
  checklistItems: { done: boolean }[];
  customFieldValues: { fieldId: string; value: string }[];
};

export type ListRules = {
  /** Max active cards; null = unlimited. */
  wipLimit: number | null;
  onEnterMarkDone: boolean;
  onEnterAssigneeId: string | null;
  onEnterLabelId: string | null;
};

export type CustomFieldType = 'text' | 'number' | 'select' | 'url';

export type CustomField = {
  id: string;
  boardId: string;
  name: string;
  type: CustomFieldType;
  options: string[];
  position: number;
};

export type CardTemplate = {
  id: string;
  boardId: string;
  name: string;
  description: string | null;
  checklist: string[];
};

export type BoardList = ListRules & {
  id: string;
  boardId: string;
  title: string;
  position: number;
  archivedAt: string | null;
  cards: CardSummary[];
};

export type BoardSummary = {
  id: string;
  title: string;
  description: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  createdBy: User;
};

export type BoardDetail = BoardSummary & {
  labels: Label[];
  lists: BoardList[];
  customFields: CustomField[];
  templates: CardTemplate[];
};

export type ChecklistItem = {
  id: string;
  cardId: string;
  text: string;
  done: boolean;
  position: number;
};

export type Comment = {
  id: string;
  cardId: string;
  authorId: string;
  body: string;
  createdAt: string;
  author: User;
};

export type CardDetail = Omit<CardSummary, 'checklistItems' | 'customFieldValues'> & {
  customFieldValues: {
    fieldId: string;
    value: string;
    field: { name: string; type: CustomFieldType };
  }[];
  list: { id: string; title: string; boardId: string };
  comments: Comment[];
  checklistItems: ChecklistItem[];
};

export type Activity = {
  id: string;
  boardId: string;
  cardId: string | null;
  actorId: string;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string; type: UserType };
};

export type Page<T> = { items: T[]; nextCursor: string | null };

export type ApiToken = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; type: UserType };
};

export type CreatedApiToken = ApiToken & { token: string };

/** At most one of these; none = end of the container. */
export type MoveTarget = { beforeId?: string; afterId?: string; index?: number };

export type CardFields = {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  completed?: boolean;
};
