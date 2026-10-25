# CLAUDE.md

Guia para o Claude Code (e humanos) trabalharem neste repositório.

## Visão geral

**Flowboard** é uma aplicação web estilo Trello (quadros → listas → cartões) para gerenciar fluxos de trabalho.
É um monorepo com backend e frontend separados, PostgreSQL como banco e Docker Compose para o ambiente local.
Um servidor MCP (`/mcp`, stdio) permite que o Claude Code leia e manipule os quadros via API do backend
(autenticando com um API token `fb_...`).

Estado atual: API REST completa (auth, boards, lists, cards, labels, comments, checklist, activity, search),
frontend funcional (board com drag and drop, modal de card, filtros, tema escuro, polling) e servidor MCP com 15 ferramentas.
O Flowboard é pensado para **fluxos executados pelo Claude Code**:

- usuários do tipo `agent`, com selo na atividade;
- regras por lista: limite de WIP e automações ao entrar;
- campos personalizados (ex.: link do PR);
- templates de card;
- `claim` atômico do próximo card.

## Estrutura de pastas

```
.
├── backend/                  # API: Node.js 20 + TypeScript + Fastify 5 + Prisma 6 + Zod 4
│   ├── prisma/
│   │   ├── schema.prisma     # Models
│   │   ├── migrations/       # Migrations versionadas (commitar!)
│   │   └── seed.ts           # Seed idempotente (admin + board de exemplo)
│   ├── src/
│   │   ├── server.ts         # Entry point (listen + graceful shutdown)
│   │   ├── app.ts            # buildApp(): plugins, swagger, error handler, registro das rotas
│   │   ├── env.ts            # Variáveis de ambiente validadas com zod (único lugar que lê process.env)
│   │   ├── errors.ts         # AppError + helpers (notFound, badRequest...) + error handler global
│   │   ├── lib/              # prisma (singleton), password (scrypt), api-token, position (ordenação)
│   │   ├── plugins/auth.ts   # Hook `authenticate` (JWT ou API token) → request.auth
│   │   ├── schemas/common.ts # Schemas zod compartilhados (idParams, moveTargetSchema, ...)
│   │   ├── services/         # Regras de negócio + acesso ao banco + registro de Activity
│   │   └── routes/           # Plugins Fastify finos: schema zod + chamada ao service
│   ├── test/                 # Vitest (integração via app.inject + banco de teste)
│   └── Dockerfile
├── frontend/                 # SPA: React 18 + Vite + TS + Tailwind 4 + React Router 7 + TanStack Query 5 + dnd-kit
│   ├── src/
│   │   ├── main.tsx          # Providers + rotas
│   │   ├── lib/              # api (cliente HTTP), types, query-keys, auth, theme, toast, board-ops, format, activity
│   │   ├── hooks/            # useBoard (queries/mutations/otimista), useCard, useBoardRealtime (polling)
│   │   ├── pages/            # AuthPage, BoardsPage, BoardPage (DnD), SettingsPage (API tokens)
│   │   └── components/       # AppLayout, RequireAuth, board/ (colunas, cards), card/ (modal), ui/ (primitivos)
│   ├── vite.config.ts        # Proxy /api -> backend
│   └── Dockerfile
├── mcp/                      # Servidor MCP stdio: TypeScript + @modelcontextprotocol/sdk + zod (roda no host, não no Docker)
│   ├── src/                  # index (stdio), server, tools, client (HTTP), resolve (nomes), format (texto)
│   └── test/                 # Vitest com API mockada (FakeApi) + cliente MCP via InMemoryTransport
├── .mcp.json                 # Registra o servidor "flowboard" no Claude Code (token via $FLOWBOARD_TOKEN)
├── docker-compose.yml        # Serviços: db, backend, frontend
├── .env.example              # Modelo do .env (copiar para .env)
└── CLAUDE.md
```

O frontend chama sempre `/api/...`; o dev server do Vite faz proxy de `/api/*` para `API_PROXY_TARGET`
(`http://backend:3333` no Docker), sem reescrever o caminho. Sem CORS em desenvolvimento.

## Comandos

Todos executados na raiz do repositório.

```bash
cp .env.example .env              # primeira vez
docker compose up --build         # sobe db, backend e frontend (foreground)
docker compose up --build -d      # idem, em background
docker compose logs -f backend    # acompanhar logs de um serviço
docker compose down               # derruba os containers (mantém os dados)
docker compose down -v            # derruba e APAGA o volume do banco
```

- Frontend: http://localhost:5150
- API: http://localhost:3333/api — **documentação OpenAPI (Swagger UI): http://localhost:3333/docs**
  (JSON em `/docs/json`)
- PostgreSQL: `localhost:5441` (`POSTGRES_PORT` no `.env`)
- As portas são fixas para não colidir com outros projetos rodando ao mesmo tempo: frontend 5150, API 3333, Postgres 5441.

Hot reload: `./backend` e `./frontend` são montados como volume; o backend usa `tsx watch` e o frontend o Vite dev server.

**Ao adicionar/remover dependências** (`package.json` mudou): o `node_modules` de cada container fica num volume
anônimo, então recrie-o com `docker compose up --build -d -V` (`-V` = `--renew-anon-volumes`).
Instale as dependências pelo host (`npm install <pkg>` dentro de `backend/` ou `frontend/`) para atualizar o `package-lock.json`.
Node no container é 20 — não use libs que exijam Node 22+ (ex.: Vitest 5).

### Migrations (Prisma)

O schema fica em `backend/prisma/schema.prisma`. Com os containers rodando:

```bash
# Cria uma nova migration a partir do schema e aplica no banco (desenvolvimento)
docker compose exec backend npx prisma migrate dev --name <nome_da_migration>

# Aplica migrations pendentes (o container do backend já faz isso ao iniciar)
docker compose exec backend npx prisma migrate deploy

# Status / reset completo do banco de dev (apaga tudo e reaplica migrations + seed)
docker compose exec backend npx prisma migrate status
docker compose exec backend npx prisma migrate reset
```

- Migrations ficam em `backend/prisma/migrations/` (via volume) e **devem ser commitadas**. Nunca edite uma migration já aplicada; crie outra.
- Arquivos gerados pelo container podem sair com permissão `666/777`; normalize com `chmod -R u=rwX,go=rX backend/prisma/migrations`.
- Depois de criar uma migration, reinicie o backend (`docker compose restart backend`) para o `tsx watch` pegar o Prisma Client novo.

### Seed

```bash
docker compose exec backend npx prisma db seed
```

Cria (de forma idempotente — pode rodar várias vezes):

- usuário **admin@flowboard.local / admin123** (humano) e usuário **Claude Agent** (`claude-agent@flowboard.local`,
  tipo `agent`). O agente não tem senha; os tokens dele são criados por um humano em Configurações → API tokens → Claude Agent.
- board **"Fluxo de Desenvolvimento"** com:
  - as listas Backlog, A Fazer, Em Progresso, Revisão e Concluído;
  - as labels `bug`, `feature` e `chore`;
  - campos personalizados: `PR` (url), `Branch` (texto), `Prioridade` (seleção alta/média/baixa) e `Estimativa (h)` (número);
  - templates `Bug` e `Feature`;
  - regras: Em Progresso tem WIP 3; Revisão atribui ao Admin ao entrar; Concluído marca como concluído ao entrar;
  - 3 cards de exemplo.

O seed usa os services, então gera Activity como uma mutação normal. Rodá-lo num banco antigo só **adiciona o que falta**:
regras só são aplicadas em listas que ainda não têm nenhuma.

### Testes

```bash
docker compose exec backend npm test          # roda a suíte uma vez
docker compose exec backend npm run test:watch
```

- Vitest + `app.inject` (sem subir servidor HTTP) contra um **banco de teste separado**: `TEST_DATABASE_URL`
  (padrão `flowboard_test` no mesmo Postgres). O `globalSetup` cria o banco se necessário e roda `prisma migrate deploy`;
  `test/setup.ts` faz `TRUNCATE` de todas as tabelas antes de cada teste. A config recusa rodar se o banco de teste for igual ao `DATABASE_URL`.
- Arquivos rodam em série (`fileParallelism: false`) porque compartilham o banco.
- Para rodar no host (Postgres exposto na 5441): `cd backend && TEST_DATABASE_URL=postgresql://flowboard:flowboard@localhost:5441/flowboard_test npm test`.

### Servidor MCP

```bash
npm --prefix mcp install && npm --prefix mcp run build   # gera mcp/dist (necessário para o .mcp.json)
npm --prefix mcp test                                    # testes com a API mockada
```

**Depois de mudar `mcp/src`, rode o build e reinicie o Claude Code** (ou `/mcp` → reconectar): o `.mcp.json` executa `mcp/dist/index.js`.
Configuração e registro estão no README (seção "Usando com o Claude Code").

### Qualidade de código

Em `backend/`, `frontend/` ou `mcp/` (no host, após `npm install`):

```bash
npm run typecheck     # tsc
npm run lint          # ESLint
npm run format        # Prettier (escreve)
npm run format:check  # Prettier (verifica)
```

## Backend: como a API funciona

### Autenticação

- `POST /api/auth/register` e `POST /api/auth/login` → `{ user, token }` (JWT HS256, validade `JWT_EXPIRES_IN`).
- Rotas protegidas aceitam `Authorization: Bearer <jwt>` **ou** `Authorization: Bearer fb_<api token>`.
  O hook `authenticate` (`src/plugins/auth.ts`) preenche `request.auth = { userId, accessUserId, method, apiTokenId? }`.
- API tokens (`/api/tokens`, CRUD): o valor `fb_...` só é retornado **uma vez**, na criação. No banco fica apenas o
  SHA-256 (`tokenHash`). `lastUsedAt` é atualizado a cada uso. Revogar = `DELETE /api/tokens/:id`.
- Senhas: `scrypt` com salt (`src/lib/password.ts`).
- **Permissões por board** (`BoardMember`, papéis `owner`/`member`): só membros veem e alteram um board. Quem cria o board
  vira `owner`. O hook `enforceBoardAccess` (`src/services/access.ts`, `preHandler` de todas as rotas protegidas) resolve o
  board do `:id` da rota (board, lista, card, item, comentário, label, campo, template) e dos ids extras (`:labelId`, `:fieldId`,
  `listId` no body, `boardId` na query) e responde **404** quando o usuário não é membro, para não revelar que o recurso existe.
  Também exige que `assigneeId`/`onEnterAssigneeId` seja membro do board (agentes sempre podem ser atribuídos).
  Listagens (`GET /boards`, `/search`, `/users`) filtram com `memberOf(accessUserId)`. **Rota nova com id de outro recurso
  no body ou na query precisa entrar nesse hook.** Regras de "mesmo board" (labels, mover entre boards) continuam nos services.
- Membros: `GET/POST /boards/:id/members` (adicionar ou trocar o papel pelo e-mail, só `owner`) e
  `DELETE /boards/:id/members/:userId` (`owner` remove qualquer um; o membro pode sair). O board sempre mantém um `owner`
  (`LAST_OWNER`). No frontend: Configurar board → Membros. Testes em `test/access.test.ts`.
- Comentários só podem ser editados ou apagados pelo autor.
- **Usuários agentes** (`User.type = agent`, ex.: Claude Agent): não fazem login com senha (o `passwordHash` é inutilizável)
  e se autenticam só com API token. Um usuário **humano** pode listar, criar e revogar tokens de agentes
  (`?userId=` / `userId` em `/tokens`). O token de agente guarda quem o criou (`ApiToken.createdById`): o agente age com o
  acesso a boards desse humano (`request.auth.accessUserId`), e cada humano só vê e revoga os tokens de agente que criou.
  Um agente só gerencia os próprios tokens. Use um token de agente no MCP para que as ações apareçam com o selo de agente (`actor.type`, `author.type` e `assignee.type` vêm na API).

### Rotas (prefixo `/api`; lista completa em `/docs`)

| Recurso   | Rotas                                                                                                                                                                               |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth      | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`                                                                                                                           |
| Tokens    | `GET/POST /tokens` (`userId` opcional para tokens de agente), `PATCH/DELETE /tokens/:id`                                                                                            |
| Boards    | `GET/POST /boards`, `GET/PATCH /boards/:id`, `POST /boards/:id/archive`, `POST /boards/:id/restore`, `GET /boards/:id/activity?limit&cursor`, `GET/POST /boards/:id/members`, `DELETE /boards/:id/members/:userId`                                        |
| Lists     | `POST /boards/:id/lists`, `GET /lists/:id`, `PATCH /lists/:id` (título + regras), `PATCH /lists/:id/move`, `POST /lists/:id/archive`, `/restore`                                    |
| Cards     | `POST /lists/:id/cards`, `GET/PATCH /cards/:id`, `GET /cards/:id/activity`, `PATCH /cards/:id/move`, `POST /cards/:id/archive`, `/restore`, `PUT/DELETE /cards/:id/labels/:labelId` |
| Labels    | `GET/POST /boards/:id/labels`, `PATCH/DELETE /labels/:id`                                                                                                                           |
| Comments  | `GET/POST /cards/:id/comments`, `PATCH/DELETE /comments/:id`                                                                                                                        |
| Checklist | `GET/POST /cards/:id/checklist`, `PATCH/DELETE /checklist-items/:id`, `PATCH /checklist-items/:id/move`                                                                             |
| Campos    | `GET/POST /boards/:id/custom-fields`, `PATCH/DELETE /custom-fields/:id`, `PUT /cards/:id/custom-fields/:fieldId` (`{ value }`, `null` limpa)                                        |
| Templates | `GET/POST /boards/:id/templates`, `PATCH/DELETE /templates/:id`, `POST /lists/:id/cards/from-template`                                                                              |
| Workflow  | `POST /boards/:id/claim` (`{ fromListId, toListId }`): claim atômico do card do topo                                                                                                |
| Outros    | `GET /search?q=&boardId=&limit=`, `GET /users`, `GET /health`                                                                                                                       |

- `GET /boards/:id` retorna o board com `labels` e `lists` ativas (ordenadas), cada uma com seus `cards` ativos (ordenados, com labels, assignee, contagens e `checklistItems: [{ done }]` para o progresso).
- Arquivar = preencher `archivedAt` (soft delete). Itens arquivados somem do board e da busca, mas continuam acessíveis por id.
- Activity é paginada por cursor: a resposta é `{ items, nextCursor }`; passe `?cursor=<nextCursor>` para a próxima página.

### Ordenação (position float)

Lists, cards e checklist items têm `position: Float`. Toda rota de criação/movimentação aceita um **alvo** (`moveTargetSchema`), no máximo um de:
`beforeId` (antes deste irmão), `afterId` (depois deste irmão) ou `index` (0-based entre os irmãos ativos). Sem alvo = final.
`PATCH /cards/:id/move` aceita também `listId` (padrão: a lista atual; precisa ser do mesmo board).

A posição nova é o **ponto médio** entre os vizinhos (`src/lib/position.ts`), então só o item movido é gravado.
Quando o espaço entre vizinhos fica menor que `MIN_POSITION_GAP`, todos os irmãos são **rebalanceados** para
`1024, 2048, 3072, ...` na mesma transação (`placeAmongSiblings` em `src/services/ordering.ts`). Itens arquivados são ignorados no cálculo.
Sempre ordene por `[position asc, id asc]` (constante `byPosition`).

### Activity

**Toda mutação de conteúdo de board** grava uma `Activity` (`recordActivity` em `src/services/activity.ts`) **dentro da
mesma transação** da mutação. Tipos no formato `<entidade>.<ação>` (ex.: `card.created`, `card.moved`,
`checklist_item.updated`), lista fechada no tipo `ActivityType`. O `payload` (JSON) leva o contexto (ex.: `fromListId`/`toListId`).
Ao criar uma mutação nova: use `prisma.$transaction`, adicione o tipo em `ActivityType` e chame `recordActivity`.
(Auth e API tokens não são conteúdo de board e não geram Activity.)

### Regras de lista (WIP e automações)

Ficam em `List`: `wipLimit`, `onEnterMarkDone`, `onEnterAssigneeId` e `onEnterLabelId`. São editadas com `PATCH /lists/:id`
e implementadas em `src/services/rules.ts`.

- Um card **entra** numa lista quando é criado nela, movido para ela a partir de outra lista ou pego via claim. Restaurar
  um card arquivado também conta para o WIP. Reordenar dentro da mesma lista não conta.
- Toda entrada chama `enterList(tx, list)`, que:
  1. trava a linha da lista com **`SELECT … FOR UPDATE`**;
  2. conta os cards ativos e lança **409 `WIP_LIMIT_REACHED`** se a lista estiver cheia;
  3. devolve os dados das automações (`completedAt`, `assigneeId`, label).

  O lock serializa entradas concorrentes, então o WIP não estoura nem com vários agentes.

- As automações aplicadas vão no `payload.automations` da activity (`card.moved`, `card.created`, `card.claimed`).
  Na criação, um `assigneeId` explícito vence a automação.
- `Card.completedAt` é o "concluído". Pode ser marcado à mão com `PATCH /cards/:id { completed }` ou pela automação.

### Claim atômico (`src/services/claim.ts`)

`POST /boards/:id/claim` roda numa transação:

1. trava a lista de origem;
2. seleciona o card do topo com `FOR UPDATE SKIP LOCKED`;
3. chama `moveCardInTx` com activity `card.claimed` e o agente como responsável.

A lista de destino passa por `enterList`, então aplica WIP e automações, mas o claim mantém o agente como responsável.
Se a lista estiver vazia, retorna 404 `NO_CARD_TO_CLAIM`. Deadlocks raros entre claims cruzados viram 409 `CONCURRENT_UPDATE`.

Os testes em `test/workflow.test.ts` disparam claims em paralelo:

- 8 agentes para 5 cards: 5 cards distintos e 3 `NO_CARD_TO_CLAIM`;
- WIP 2 com 6 claims: só 2 passam.

Se você remover os locks, esses testes falham. **Não troque esses locks por checagens feitas fora da transação.**

### Campos personalizados e templates

- `CustomField` (por board: `text | number | select | url`, `options` para seleção). Os valores ficam em
  `CardCustomFieldValue` como texto já **validado e normalizado** (`normalizeFieldValue` em `src/services/custom-fields.ts`):
  número canônico, URL http(s) absoluta, opção de seleção comparada sem diferenciar maiúsculas. O tipo não muda depois de criado.
- `GET /boards/:id` inclui `customFields`, `templates` e, em cada card, `customFieldValues: [{ fieldId, value }]`.
  O detalhe do card também traz `field.name`/`field.type`.
- `CardTemplate` guarda a descrição (markdown) e o checklist (`text[]`). `createCardFromTemplate` reutiliza `createCardInList`,
  então WIP e automações também valem para cards criados a partir de template.

### Validação e erros

- Toda rota declara `params`/`querystring`/`body` com **zod** no `schema` (via `fastify-type-provider-zod`); isso também gera o OpenAPI.
- Todos os erros saem no formato `{ "error": { "code": "...", "message": "..." } }` (validação inclui `details`).
  Códigos: `VALIDATION_ERROR` (400), `BAD_REQUEST`/`INVALID_MOVE_TARGET`/`CROSS_BOARD_MOVE`/`INVALID_LABEL`/`INVALID_ASSIGNEE`/`LAST_OWNER` (400),
  `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND`/`ROUTE_NOT_FOUND` (404), `CONFLICT`/`EMAIL_TAKEN` (409), `INTERNAL_ERROR` (500).
- Nos services, lance os helpers de `src/errors.ts` (`notFound('Card')`, `badRequest(msg, code)`, ...) — nunca responda erros manualmente nas rotas.

## Frontend: como funciona

### Rotas (React Router 7, modo biblioteca — v8 exige React 19/Node 22)

`/login`, `/register` (públicas) · `/boards` · `/boards/:boardId` · `/boards/:boardId/cards/:cardId` (modal sobre o board, rota filha) · `/settings`.
`RequireAuth` redireciona para `/login` guardando a origem; após o login o usuário volta para onde estava.

### Auth

O JWT fica em memória (`src/lib/api.ts`, enviado em toda requisição) e é espelhado no `localStorage` (`flowboard.token`) pelo `AuthProvider`.
Qualquer 401 da API faz logout automático. O tema fica em `flowboard.theme` (`light`/`dark`/ausente = sistema; classe `dark` no `<html>`).

### Dados (TanStack Query)

- Todas as chamadas HTTP ficam em `src/lib/api.ts`; tipos de resposta em `src/lib/types.ts` (espelham o backend — atualize ao mudar a API).
- **Tudo de um board fica sob a query key `['board', boardId, ...]`** (`src/lib/query-keys.ts`): detalhe, card aberto e atividade do card. Uma invalidação desse prefixo atualiza a tela inteira.
- Mutations de board usam `useBoardMutation(boardId, fn)` (`src/hooks/useBoard.ts`): mostram toast em erro e invalidam o board ao terminar.
- **Mover card/lista é otimista** (`useMoveCard` / `useMoveList`): o cache é atualizado de forma síncrona, a API é chamada com um alvo ancorado no vizinho (`afterId`/`beforeId`, via `neighborTarget`), e em erro o snapshot anterior é restaurado (rollback + toast). A lógica pura de reordenação fica em `src/lib/board-ops.ts`.

### Tempo real

`useBoardRealtime(boardId, { paused })` (`src/hooks/useBoardRealtime.ts`) invalida `['board', boardId]` a cada 5 s — é assim que mudanças feitas pelo Claude Code via MCP aparecem sem recarregar.
Ele pula o ciclo durante um drag, com a aba oculta ou com mutation do board em andamento. **Para trocar por WebSocket, só o corpo desse hook muda.**

### Drag and drop (dnd-kit)

`BoardPage` tem um `DndContext` com um `SortableContext` horizontal (listas, arrastadas pelo cabeçalho) e um vertical por coluna (cards).
Durante o drag, o board é renderizado a partir de uma cópia local (`dragLists`); no `onDragOver` o card troca de coluna, e no `onDragEnd` o índice final é calculado e a mutation otimista é disparada.
O `PointerSensor` só ativa após 5 px, para que um clique abra o modal. Campos de texto dentro de áreas arrastáveis fazem `stopPropagation` de `keydown`/`pointerdown`.

### UI

Textos da interface em português; código em inglês. Classes compartilhadas de botões/inputs ficam em `src/components/ui/styles.ts`; ícones SVG inline em `src/components/ui/icons.tsx`.
Toda cor precisa da variante `dark:`. Markdown (descrição e comentários) é renderizado com `react-markdown` + `remark-gfm` e estilizado com `prose` (`@tailwindcss/typography`).

## MCP: como funciona

- Cada ferramenta fica em `mcp/src/tools.ts` com `registerTool(nome, { description, inputSchema (zod), annotations }, handler)`.
  O corpo roda dentro de `respond()`, que converte qualquer erro em `isError: true` + texto curto (sem stack trace).
- Erros da API viram `FlowboardError` em `client.ts` (`Flowboard API error 404 NOT_FOUND: Card not found`; 401 e API fora do ar têm mensagens específicas de como resolver).
- Saídas são **texto compacto** (`format.ts`): uma linha por card, ids entre colchetes (`[card:…]`, `[list:…]`, `[item:…]`) para o modelo reutilizar. Evite JSON cru e campos desnecessários — economiza contexto.
- Boards, listas, labels e usuários podem ser referenciados por nome (`resolve.ts`: sem diferenciar maiúsculas e acentos); nomes desconhecidos/ambíguos retornam erro listando as opções.
- **Nunca exponha exclusão definitiva**: só arquivar (`update_card` com `archived: true`). O único `DELETE` usado é para desanexar uma label do card.
- stdout é o canal do protocolo: logs apenas com `console.error`.
- Testes: `FakeApi` (`test/fake-api.ts`) registra rotas `"METHOD /path/:param"` e grava as chamadas; use `api.writes()` para afirmar exatamente o que foi enviado.
- Ao adicionar uma ferramenta: schema zod com `.describe()` em cada campo, descrição clara de quando usar, annotation `READ`/`WRITE`, teste no `test/tools.test.ts` e linha na tabela do `mcp/README.md`.
- Ferramentas de fluxo de agente:
  - `claim_next_card`, que usa o claim atômico do backend;
  - `set_custom_field`, que encontra o campo pelo nome;
  - `create_card_from_template`, que encontra o template pelo nome no board da lista.

  O `get_board` mostra as regras ("2/3 WIP FULL", "On enter: …"), os campos, os templates e os valores dos campos.
  As instruções do servidor (`server.ts`) descrevem o fluxo típico para o modelo.

### Exemplo de fluxo com o Claude Code

Peça ao Claude Code (com o MCP configurado com um token do **Claude Agent**):

> pegue o próximo card de A Fazer, implemente, coloque o link do PR no campo e mova para Revisão

O que acontece:

1. `claim_next_card(board, "A Fazer", "Em Progresso")`: o backend, **numa transação**, trava a lista de origem,
   pega o card do topo, atribui ao agente e move para Em Progresso (respeitando o WIP 3). Dois agentes em paralelo
   nunca recebem o mesmo card.
2. O Claude lê o card (descrição, checklist, campos), implementa no repositório e marca o checklist com `toggle_checklist_item`.
3. `set_custom_field(card, "PR", "https://github.com/…/pull/42")`: o valor é validado como URL.
4. `move_card(card, "Revisão")`: a automação da lista atribui o card ao Admin, que é quem revisa.

Tudo aparece no board em até 5 s (polling), com o selo **agente** no histórico. Quando o Admin move o card para
Concluído, a automação marca o card como concluído.

## Convenções de código

- **TypeScript em modo `strict`** (com `noUncheckedIndexedAccess`). Evite `any` (liberado só nos testes); prefira `unknown` + narrowing.
- **ESLint + Prettier** em cada pacote (flat config `eslint.config.js`, `.prettierrc`: aspas simples, ponto e vírgula, trailing commas, 100 colunas). O código deve passar em `lint` e `format:check` antes de commitar. Variáveis não usadas intencionais começam com `_`.
- **Nomes em inglês no código**: variáveis, funções, tipos, arquivos, rotas, tabelas/colunas, códigos de erro e mensagens de log/erro da API. Documentação e comunicação com o usuário podem ser em português.
- Backend em ESM (`"type": "module"`): imports relativos usam extensão `.js` (ex.: `import { prisma } from './lib/prisma.js'`).
- Backend em camadas: `routes/` (HTTP + schema zod) → `services/` (regras, transação, Activity) → Prisma. Rotas não acessam o Prisma diretamente.
  Nunca retorne `passwordHash`/`tokenHash`: use `publicUserSelect` e os selects dos services.
- Timestamps são `timestamptz(6)` no Postgres; IDs são UUID.
- Frontend: componentes React como funções nomeadas (named exports), estilos com classes Tailwind; chamadas HTTP concentradas em `src/lib/api.ts`; dados do servidor só via TanStack Query (sem copiar para `useState`, exceto rascunhos de edição).
- Configuração sempre via variáveis de ambiente definidas em `.env` (nunca commitar o `.env`; atualizar o `.env.example` ao criar variáveis novas).

## Conta de teste (login)

Regra global de todos os projetos: quando a aplicação tem login ou cadastro, o Claude usa a conta **`admin@claude.local` / `admin123`** para entrar, testar e tirar prints. Se ela ainda não existir no banco de desenvolvimento, crie pelo cadastro da própria aplicação (ou pelo seed). A conta é só de desenvolvimento: nunca a crie nem a deixe ativa em produção.

## Repositório

- GitHub: `JoaoPedroSaraivaDrummond/Flowboard`, **PÚBLICO**. Tudo o que for commitado, inclusive o histórico, fica visível para qualquer pessoa.
- Antes de cada commit, revise `git diff --cached`: não pode entrar nada de `.env`, tokens (`fb_...`), chaves, senhas reais, dados pessoais ou caminhos da máquina local.
- Segredo commitado por engano precisa ser revogado e trocado. Apagar o arquivo depois não resolve.
- **Commit e push liberados:** o Claude pode commitar e dar push sem pedir confirmação, sempre na `dev`. Como o repositório é público, a revisão do `git diff --cached` descrita acima é obrigatória antes de cada commit.
- **Branches:** o desenvolvimento acontece na `dev`; nada vai direto para a `main`. A `dev` é a branch padrão no GitHub; a `main` só recebe merge da `dev` quando o usuário pedir. Os relatórios em `docs/security-audit/` estão no `.git/info/exclude` e nunca devem ser commitados.

## Versionamento

Segue o padrão **MAJOR.MINOR.PATCH** (ex.: `1.4.2`), comum a todos os projetos:

- **MAJOR** (primeiro número): mudança incompatível com versões anteriores; quem usa o software pode precisar alterar o próprio código. Ex.: `1.4.2` → `2.0.0`.
- **MINOR** (segundo número): funcionalidade nova sem quebrar o que já existia. Ex.: `1.4.2` → `1.5.0`.
- **PATCH** (terceiro número): correção de bug que não muda o comportamento esperado nem adiciona recurso. Ex.: `1.4.2` → `1.4.3`.

Ao subir um número, os da direita voltam a zero. A versão é atualizada no mesmo commit que traz a mudança, na `dev`. Mudança só de documentação não sobe versão.

- Onde fica: campo `version` de `backend/package.json`, `frontend/package.json` e `mcp/package.json`, sempre com o mesmo número (hoje `0.3.0`), além de `SERVER_VERSION` em `mcp/src/server.ts` e da versão do OpenAPI em `backend/src/app.ts`. O `frontend/vite.config.ts` injeta essa versão em `import.meta.env.VITE_APP_VERSION`, que aparece ao lado do nome no cabeçalho (`components/AppLayout.tsx`); não escreva a versão à mão no código.

## Auditoria de segurança (obrigatória a cada alteração)

Sempre que este projeto tiver alterações, execute a auditoria abaixo antes de encerrar a tarefa. Gere ou atualize o relatório em `docs/security-audit/`.

Revisa este código atrás de cinco falhas de segurança. Antes de começar, detecte a stack do projeto (linguagem, framework, ORM/query builder, mecanismo de auth, frontend, arquivos de deploy como Docker/CI/Helm/Terraform) e adapte cada categoria ao equivalente dessa stack:

1. BANCO SEM TRANCA (isolamento de inquilino/dono) — em Supabase é RLS ausente; em APIs próprias são queries de listagem/busca/agregação/relatório/exportação que não filtram pelo usuário autenticado ou pela organização/workspace/tenant ao qual ele pertence. Identifique primeiro QUAL é o mecanismo de isolamento do projeto (RLS, middleware de tenant, filtro manual por user_id, etc.) e aponte onde ele está ausente ou furado.

2. PERMISSÃO DEFINIDA NO NAVEGADOR — operações privilegiadas (admin, configurações, gestão de usuários, ações de escrita) em que o frontend esconde a UI por papel (isAdmin, canEdit, role...) mas o servidor NÃO faz a verificação equivalente. Cruze cada gate de papel do frontend com o endpoint correspondente e confirme se o backend valida o privilégio em toda rota sensível.

3. IDOR — rotas que buscam, alteram ou deletam um objeto por ID (path, query ou body) sem verificar se o objeto pertence ao usuário/tenant do chamador. Percorra sistematicamente TODOS os handlers de rota do backend, não amostras.

4. CHAVES EXPOSTAS (hardcode) — API keys, tokens, senhas, segredos de assinatura (JWT, webhooks), chaves privadas e credenciais padrão embutidos no código-fonte, configs, docker-compose, charts, CI, scripts e documentação. Atenção especial a defaults públicos que viram segredo real se não forem sobrescritos (ex: ${VAR:-valor-default}) e à ausência de validação de startup que rejeite esses defaults. Verifique também o histórico git por segredos commitados e o bundle do frontend por chaves embutidas.

5. INPUTS SEM TRATAMENTO (XSS) — no frontend: innerHTML/dangerouslySetInnerHTML/equivalentes do framework (v-html, [innerHTML], dangerouslySet...), renderização de markdown/HTML sem sanitização, URLs controladas por usuário em href/src (javascript:), eval/new Function. No backend: input do usuário entrando em HTML de e-mails, templates ou respostas sem escape. Verifique se existe lib de sanitização no projeto e se ela é aplicada nos pontos encontrados.

REGRAS DA AUDITORIA:
- Reporte apenas achados verificados no código real. Nada de especulação. Para cada achado: caminho do arquivo, número(s) exato(s) da linha, trecho do código, por que é explorável e severidade (crítica/alta/média/baixa/informativa).
- Liste arquivo por arquivo, linha por linha.
- Registre também o que foi verificado e está CORRETO (ex: "router X valida posse em todos os handlers") — isso vira a seção de pontos fortes e prova a cobertura da auditoria.
- Quando a categoria não se aplicar à stack (ex: projeto sem frontend), diga isso explicitamente em vez de forçar achados.
- Note condições de explorabilidade (feature flags, config insegura necessária, etc.).

DEPOIS DA AUDITORIA, gere um RELATÓRIO EM PDF, visualmente amigável, em pt-BR, salvo em docs/security-audit/relatorio-auditoria-seguranca.pdf, contendo:

a) Capa: título "Relatório de Auditoria de Segurança — <nome do projeto>", data, escopo auditado e nota metodológica (como cada categoria foi mapeada para a stack detectada).
b) Resumo executivo: total de achados por severidade, gráfico de rosca por severidade e gráfico de barras por categoria. Paleta: crítica #B91C1C, alta #EA580C, média #D97706, baixa #2563EB, ponto forte #059669.
c) Pontos fortes (o que está protegido, com evidência) e pontos fracos (os riscos centrais).
d) Tabela de achados detalhados por categoria: Severidade | Arquivo:linha | Descrição, com chip de severidade colorido.
e) Recomendações priorizadas (P1, P2, P3...).
f) AO FINAL DO PDF, uma seção "ISSUES PARA O GITHUB": para cada achado acionável, o texto COMPLETO de uma issue em Markdown, pronto para copiar e colar, dentro de um bloco delimitado (ex: entre --- ISSUE n --- e --- FIM ISSUE n ---). Cada issue deve conter:
- Título no formato "[Segurança] <descrição curta da falha>"
- Labels sugeridas: security + severidade
- Descrição do problema e por que é explorável
- Evidência: arquivo:linha com trecho de código
- Impacto
- Sugestão de correção
- Critérios de aceite (checklist verificável)
Agrupe achados triviais relacionados numa issue única quando fizer sentido (ex: vários defaults de segredo no mesmo tema), para não gerar spam de issues.

GERAÇÃO DO PDF — REGRAS TÉCNICAS:
- Não instale nada globalmente. Use ambiente isolado (venv Python com reportlab+matplotlib, ou ferramenta equivalente da stack local; se houver navegador headless/wkhtmltopdf/pandoc disponível, HTML→PDF também vale).
- Deixe o script gerador em docs/security-audit/ para regerar o relatório depois.
- Verifique o PDF gerado: número de páginas, renderização dos gráficos e legibilidade das tabelas (rasterize as páginas se possível). Corrija defeitos visuais antes de entregar.
- Páginas A4, margens ~2cm, cabeçalho/rodapé com nome do relatório e número de página.

Me entregue ao final: o relatório em PDF, a lista de achados no chat (arquivo por arquivo, linha por linha) e o caminho de todos os arquivos gerados.
