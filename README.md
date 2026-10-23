# Flowboard

Aplicação web estilo Trello para gerenciar fluxos de trabalho com quadros, listas e cartões.
Um servidor MCP permite que o Claude Code leia e manipule os quadros.

## Stack

| Parte      | Tecnologia                                         |
| ---------- | -------------------------------------------------- |
| `backend`  | Node.js 20, TypeScript, Fastify 5, Prisma 6, Zod 4 |
| `frontend` | React 18, Vite 6, TypeScript, Tailwind CSS 4       |
| Banco      | PostgreSQL 16                                      |
| `mcp`      | Servidor MCP (stdio) para o Claude Code            |

## Subindo localmente

Pré-requisito: Docker com Docker Compose v2.

```bash
cp .env.example .env
docker compose up --build
```

- Frontend: http://localhost:5173
- API: http://localhost:3333/api — documentação em http://localhost:3333/docs
- PostgreSQL: `localhost:5432` (usuário/senha em `.env`)

Popular com dados de exemplo (admin@flowboard.local / admin123):

```bash
docker compose exec backend npx prisma db seed
```

Rodar os testes do backend: `docker compose exec backend npm test`.

Para derrubar: `docker compose down` (adicione `-v` para apagar também os dados do banco).

## Usando com o Claude Code (MCP)

O servidor MCP em [`mcp/`](./mcp) dá ao Claude Code ferramentas para listar boards e para ler, criar, mover,
comentar e arquivar cards. Também permite pegar o próximo card de uma fila de forma atômica, preencher campos personalizados
e criar cards a partir de templates. Requer Node.js 20+ no host e a stack rodando (`docker compose up`).

**1. Compile o servidor**

```bash
npm --prefix mcp install
npm --prefix mcp run build
```

**2. Gere um API token**

Entre em http://localhost:5173 (ex.: `admin@flowboard.local` / `admin123`) e vá em **Configurações → API tokens**.
Escolha **Claude Agent**, crie um token (ex.: "Claude Code") e copie o valor `fb_...`. Ele só é exibido uma vez.
As ações feitas com esse token aparecem no histórico em nome do Claude Agent, com o selo **agente**. Se preferir
que as ações saiam em seu nome, crie o token em "Seus tokens".

**3. Registre o servidor** (escolha uma opção)

_Opção A — `.mcp.json` do projeto (já incluso no repositório)._ Ele lê o token da variável de ambiente
`FLOWBOARD_TOKEN`, então exporte-a no shell onde você roda o Claude Code (ex.: no `~/.bashrc`):

```bash
export FLOWBOARD_TOKEN=fb_seu_token
# opcional, se a API não estiver em http://localhost:3333/api:
# export FLOWBOARD_API_URL=http://outro-host:3333/api
```

Abra o `claude` na raiz do projeto e aprove o servidor `flowboard` quando for perguntado
(servidores de `.mcp.json` pedem aprovação na primeira vez; para refazer a escolha: `claude mcp reset-project-choices`).

_Opção B — `claude mcp add`_, para usar o Flowboard de qualquer diretório (escopo de usuário):

```bash
claude mcp add --transport stdio --scope user \
  --env FLOWBOARD_TOKEN=fb_seu_token \
  --env FLOWBOARD_API_URL=http://localhost:3333/api \
  flowboard -- node "$(pwd)/mcp/dist/index.js"
```

(rode na raiz do repositório para que `$(pwd)` aponte para ele; aqui o token fica salvo na config do Claude Code.
Se usar esta opção dentro deste repositório, recuse o `flowboard` do `.mcp.json` para não ter dois servidores com o mesmo nome.)

**4. Verifique e use**

```bash
claude mcp list          # flowboard deve aparecer como ✓ Connected
```

Reinicie o Claude Code e peça, por exemplo: _"liste os cards em Em Progresso no Flowboard"_,
_"crie um card 'Login quebrado' em A Fazer usando o template Bug"_ ou _"mova o card X para Revisão"_.
Dentro do Claude Code, `/mcp` mostra o status do servidor e as ferramentas disponíveis.

### Exemplo: o Claude Code executando o fluxo de trabalho

O board de exemplo vem configurado para agentes:

- **Em Progresso** tem limite de WIP 3;
- **Revisão** atribui o card ao Admin ao entrar;
- **Concluído** marca o card como concluído;
- há campos `PR`, `Branch`, `Prioridade` e `Estimativa (h)`, e templates `Bug` e `Feature`.

Peça ao Claude Code:

> pegue o próximo card de A Fazer, implemente, coloque o link do PR no campo e mova para Revisão

O Claude vai:

1. chamar `claim_next_card(board, "A Fazer", "Em Progresso")`, que pega o card do topo de forma **atômica**
   (dois agentes em paralelo nunca recebem o mesmo card), atribui ao Claude Agent e move para Em Progresso;
2. ler a descrição e o checklist, implementar no repositório e marcar os itens com `toggle_checklist_item`;
3. abrir o PR e salvar o link com `set_custom_field(card, "PR", "https://github.com/…/pull/42")`;
4. chamar `move_card(card, "Revisão")`, e a automação atribui o card a você para revisar.

No navegador, o board atualiza sozinho (polling de 5 s). O card mostra o link do PR, e o histórico (botão **Atividade**)
mostra cada passo com o selo **agente**. Se Em Progresso estiver cheia, o claim é recusado com uma mensagem clara sobre o limite de WIP.

### Recursos de fluxo no board

- **Regras de lista** (ícone de engrenagem na coluna): limite de WIP e automações ao entrar (marcar como concluído,
  atribuir a alguém, adicionar etiqueta). O contador mostra `2/3` e fica destacado quando a lista está cheia.
- **Campos personalizados** e **templates de card**: em **Configurar**, no cabeçalho do board. Os campos aparecem no card e no modal.
  Para usar um template, escolha-o em "Adicionar card".
- **Filtros**: texto, etiqueta, responsável e "Só meus cards". Ficam na URL, então sobrevivem ao recarregar e dá para compartilhar o link.

Mais detalhes (migrations, convenções, estrutura) em [CLAUDE.md](./CLAUDE.md).
