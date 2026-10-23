import type { Config } from './config.js';
import type {
  Activity,
  BoardDetail,
  BoardList,
  BoardSummary,
  CardDetail,
  CardFields,
  CardTemplate,
  CustomField,
  CardSummary,
  ChecklistItem,
  Comment,
  LabelRef,
  MoveTarget,
  Page,
  SearchResult,
  User,
} from './types.js';

/** Error whose message is safe and useful to show to the model as-is. */
export class FlowboardError extends Error {}

const REQUEST_TIMEOUT_MS = 15_000;

type ApiErrorBody = {
  error?: { code?: string; message?: string; details?: { path?: string; message?: string }[] };
};

function describeApiError(status: number, body: unknown): string {
  if (status === 401) {
    return 'Authentication failed (401): FLOWBOARD_TOKEN is invalid or was revoked. Create a new API token in Flowboard → Configurações and restart Claude Code with it.';
  }
  const error = (body as ApiErrorBody | null)?.error;
  let message = `Flowboard API error ${status}${error?.code ? ` ${error.code}` : ''}: ${
    error?.message ?? 'unexpected response'
  }`;
  if (error?.details?.length) {
    message += ` (${error.details.map((d) => `${d.path}: ${d.message}`).join('; ')})`;
  }
  return message;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export class FlowboardClient {
  constructor(
    private readonly config: Config,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  private async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    if (!this.config.token) {
      throw new FlowboardError(
        'FLOWBOARD_TOKEN is not set. Create an API token in Flowboard (Configurações → API tokens), export FLOWBOARD_TOKEN=fb_... and restart Claude Code.',
      );
    }

    let response: Response;
    try {
      response = await this.fetchFn(`${this.config.apiUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.config.token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new FlowboardError(
        timedOut
          ? `Flowboard API at ${this.config.apiUrl} did not respond within ${REQUEST_TIMEOUT_MS / 1000}s.`
          : `Cannot reach the Flowboard API at ${this.config.apiUrl}. Is the backend running (docker compose up)? Check FLOWBOARD_API_URL.`,
      );
    }

    if (response.status === 204) return undefined as T;
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new FlowboardError(describeApiError(response.status, data));
    return data as T;
  }

  listBoards(includeArchived = false) {
    return this.request<BoardSummary[]>('GET', `/boards?includeArchived=${includeArchived}`);
  }
  getBoard(boardId: string) {
    return this.request<BoardDetail>('GET', `/boards/${boardId}`);
  }
  boardActivity(boardId: string, limit: number) {
    return this.request<Page<Activity>>('GET', `/boards/${boardId}/activity?limit=${limit}`);
  }
  boardLabels(boardId: string) {
    return this.request<LabelRef[]>('GET', `/boards/${boardId}/labels`);
  }
  createList(boardId: string, title: string) {
    return this.request<BoardList>('POST', `/boards/${boardId}/lists`, { title });
  }
  createCard(listId: string, data: CardFields & MoveTarget & { title: string }) {
    return this.request<CardSummary>('POST', `/lists/${listId}/cards`, data);
  }
  getCard(cardId: string) {
    return this.request<CardDetail>('GET', `/cards/${cardId}`);
  }
  updateCard(cardId: string, data: CardFields) {
    return this.request<CardSummary>('PATCH', `/cards/${cardId}`, data);
  }
  moveCard(cardId: string, listId: string, target: MoveTarget) {
    return this.request<CardSummary>('PATCH', `/cards/${cardId}/move`, { listId, ...target });
  }
  setCardArchived(cardId: string, archived: boolean) {
    return this.request<CardSummary>(
      'POST',
      `/cards/${cardId}/${archived ? 'archive' : 'restore'}`,
    );
  }
  addCardLabel(cardId: string, labelId: string) {
    return this.request<CardSummary>('PUT', `/cards/${cardId}/labels/${labelId}`);
  }
  removeCardLabel(cardId: string, labelId: string) {
    // Only detaches the label from the card; this client never deletes resources.
    return this.request<CardSummary>('DELETE', `/cards/${cardId}/labels/${labelId}`);
  }
  searchCards(query: string, boardId: string | undefined, limit: number) {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    if (boardId) params.set('boardId', boardId);
    return this.request<SearchResult[]>('GET', `/search?${params}`);
  }
  addComment(cardId: string, body: string) {
    return this.request<Comment>('POST', `/cards/${cardId}/comments`, { body });
  }
  addChecklistItem(cardId: string, text: string) {
    return this.request<ChecklistItem>('POST', `/cards/${cardId}/checklist`, { text });
  }
  updateChecklistItem(itemId: string, data: { done?: boolean; text?: string }) {
    return this.request<ChecklistItem>('PATCH', `/checklist-items/${itemId}`, data);
  }
  getList(listId: string) {
    return this.request<BoardList>('GET', `/lists/${listId}`);
  }
  claimNextCard(boardId: string, fromListId: string, toListId: string) {
    return this.request<CardDetail>('POST', `/boards/${boardId}/claim`, { fromListId, toListId });
  }
  setCustomField(cardId: string, fieldId: string, value: string | number | null) {
    return this.request<{ name: string; value: string | null }>(
      'PUT',
      `/cards/${cardId}/custom-fields/${fieldId}`,
      { value },
    );
  }
  boardCustomFields(boardId: string) {
    return this.request<CustomField[]>('GET', `/boards/${boardId}/custom-fields`);
  }
  boardTemplates(boardId: string) {
    return this.request<CardTemplate[]>('GET', `/boards/${boardId}/templates`);
  }
  createCardFromTemplate(listId: string, templateId: string, title?: string) {
    return this.request<CardSummary>('POST', `/lists/${listId}/cards/from-template`, {
      templateId,
      title,
    });
  }
  listUsers() {
    return this.request<User[]>('GET', '/users');
  }
}
