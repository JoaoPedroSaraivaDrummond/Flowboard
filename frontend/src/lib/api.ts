import type {
  Activity,
  ApiToken,
  AuthResponse,
  BoardDetail,
  BoardList,
  BoardMember,
  BoardRole,
  BoardSummary,
  CardDetail,
  CardFields,
  CardSummary,
  ChecklistItem,
  Comment,
  CardTemplate,
  CreatedApiToken,
  CustomField,
  CustomFieldType,
  ListRules,
  Label,
  MoveTarget,
  Page,
  User,
} from './types';

/** Error in the backend format `{ error: { code, message } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// The token lives in memory here; AuthProvider mirrors it to localStorage.
let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (authToken) headers.authorization = `Bearer ${authToken}`;

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (data as { error?: { code?: string; message?: string } } | null)?.error;
    if (response.status === 401 && authToken) unauthorizedHandler?.();
    throw new ApiError(
      response.status,
      error?.code ?? 'HTTP_ERROR',
      error?.message ?? response.statusText,
    );
  }
  return data as T;
}

const query = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

export const api = {
  login: (email: string, password: string) =>
    request<AuthResponse>('POST', '/auth/login', { email, password }),
  register: (name: string, email: string, password: string) =>
    request<AuthResponse>('POST', '/auth/register', { name, email, password }),
  me: () => request<User & { authMethod: string }>('GET', '/auth/me'),
  users: () => request<User[]>('GET', '/users'),

  listTokens: (userId?: string) => request<ApiToken[]>('GET', `/tokens${query({ userId })}`),
  createToken: (name: string, userId?: string) =>
    request<CreatedApiToken>('POST', '/tokens', { name, userId }),
  deleteToken: (id: string) => request<void>('DELETE', `/tokens/${id}`),

  listBoards: () => request<BoardSummary[]>('GET', '/boards'),
  createBoard: (data: { title: string; description?: string | null }) =>
    request<BoardSummary>('POST', '/boards', data),
  getBoard: (boardId: string) => request<BoardDetail>('GET', `/boards/${boardId}`),
  updateBoard: (boardId: string, data: { title?: string; description?: string | null }) =>
    request<BoardSummary>('PATCH', `/boards/${boardId}`, data),
  listMembers: (boardId: string) => request<BoardMember[]>('GET', `/boards/${boardId}/members`),
  addMember: (boardId: string, email: string, role: BoardRole) =>
    request<BoardMember>('POST', `/boards/${boardId}/members`, { email, role }),
  removeMember: (boardId: string, userId: string) =>
    request<void>('DELETE', `/boards/${boardId}/members/${userId}`),

  createList: (boardId: string, title: string) =>
    request<BoardList>('POST', `/boards/${boardId}/lists`, { title }),
  updateList: (listId: string, data: Partial<ListRules> & { title?: string }) =>
    request<BoardList>('PATCH', `/lists/${listId}`, data),
  moveList: (listId: string, target: MoveTarget) =>
    request<BoardList>('PATCH', `/lists/${listId}/move`, target),
  archiveList: (listId: string) => request<BoardList>('POST', `/lists/${listId}/archive`),

  createCard: (listId: string, title: string) =>
    request<CardSummary>('POST', `/lists/${listId}/cards`, { title }),
  getCard: (cardId: string) => request<CardDetail>('GET', `/cards/${cardId}`),
  updateCard: (cardId: string, data: CardFields) =>
    request<CardSummary>('PATCH', `/cards/${cardId}`, data),
  moveCard: (cardId: string, listId: string, target: MoveTarget) =>
    request<CardSummary>('PATCH', `/cards/${cardId}/move`, { listId, ...target }),
  archiveCard: (cardId: string) => request<CardSummary>('POST', `/cards/${cardId}/archive`),
  addCardLabel: (cardId: string, labelId: string) =>
    request<CardSummary>('PUT', `/cards/${cardId}/labels/${labelId}`),
  removeCardLabel: (cardId: string, labelId: string) =>
    request<CardSummary>('DELETE', `/cards/${cardId}/labels/${labelId}`),
  cardActivity: (cardId: string, cursor?: string) =>
    request<Page<Activity>>('GET', `/cards/${cardId}/activity${query({ limit: 20, cursor })}`),

  createLabel: (boardId: string, data: { name: string; color: string }) =>
    request<Label>('POST', `/boards/${boardId}/labels`, data),
  boardActivity: (boardId: string, cursor?: string) =>
    request<Page<Activity>>('GET', `/boards/${boardId}/activity${query({ limit: 30, cursor })}`),

  createCustomField: (
    boardId: string,
    data: { name: string; type: CustomFieldType; options?: string[] },
  ) => request<CustomField>('POST', `/boards/${boardId}/custom-fields`, data),
  deleteCustomField: (fieldId: string) => request<void>('DELETE', `/custom-fields/${fieldId}`),
  setCustomFieldValue: (cardId: string, fieldId: string, value: string | null) =>
    request<{ value: string | null }>('PUT', `/cards/${cardId}/custom-fields/${fieldId}`, {
      value,
    }),

  createTemplate: (
    boardId: string,
    data: { name: string; description?: string | null; checklist?: string[] },
  ) => request<CardTemplate>('POST', `/boards/${boardId}/templates`, data),
  deleteTemplate: (templateId: string) => request<void>('DELETE', `/templates/${templateId}`),
  createCardFromTemplate: (listId: string, templateId: string, title?: string) =>
    request<CardSummary>('POST', `/lists/${listId}/cards/from-template`, { templateId, title }),

  createComment: (cardId: string, body: string) =>
    request<Comment>('POST', `/cards/${cardId}/comments`, { body }),
  deleteComment: (commentId: string) => request<void>('DELETE', `/comments/${commentId}`),

  createChecklistItem: (cardId: string, text: string) =>
    request<ChecklistItem>('POST', `/cards/${cardId}/checklist`, { text }),
  updateChecklistItem: (itemId: string, data: { text?: string; done?: boolean }) =>
    request<ChecklistItem>('PATCH', `/checklist-items/${itemId}`, data),
  deleteChecklistItem: (itemId: string) => request<void>('DELETE', `/checklist-items/${itemId}`),
};
