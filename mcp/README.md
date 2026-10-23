# Flowboard MCP Server

Servidor [MCP](https://modelcontextprotocol.io) (transporte **stdio**) que dá ao Claude Code acesso ao Flowboard
através da API REST do backend. Não acessa o banco diretamente.

## Configuração

| Variável            | Padrão                      | Descrição                                                                                              |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `FLOWBOARD_API_URL` | `http://localhost:3333/api` | URL base da API                                                                                        |
| `FLOWBOARD_TOKEN`   | —                           | API token (`fb_...`) criado em Configurações → API tokens (de preferência do usuário **Claude Agent**) |

Sem token o servidor sobe mesmo assim, mas toda ferramenta responde com um erro explicando como configurá-lo.

## Comandos

```bash
npm install
npm run build        # compila para dist/
npm start            # roda dist/index.js (stdio) — normalmente quem roda é o Claude Code
npm run dev          # roda direto do TypeScript (tsx)
npm test             # testes com a API mockada
npm run inspect      # abre o MCP Inspector apontando para dist/index.js
```

## Ferramentas

| Ferramenta                  | O que faz                                                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `list_boards`               | Lista boards com ids                                                                                                |
| `get_board`                 | Listas e cards (resumidos) de um board — aceita id ou título                                                        |
| `get_card`                  | Detalhe: descrição, labels, responsável, prazo, checklist (com ids) e comentários                                   |
| `search_cards`              | Busca em títulos/descrições (opcionalmente num board)                                                               |
| `create_card`               | Cria card numa lista (labels por nome, `dueDate` `YYYY-MM-DD`, posição top/bottom)                                  |
| `update_card`               | Atualiza campos parciais; `labels` substitui o conjunto; `completed` marca como concluído; `archived: true` arquiva |
| `move_card`                 | Move para uma lista do mesmo board por **id ou nome** (sem diferenciar maiúsculas/acentos), top/bottom              |
| `add_comment`               | Comenta num card                                                                                                    |
| `add_checklist_item`        | Adiciona item ao checklist                                                                                          |
| `toggle_checklist_item`     | Marca/desmarca item                                                                                                 |
| `create_list`               | Cria lista no fim de um board                                                                                       |
| `get_board_activity`        | Atividade recente do board                                                                                          |
| `claim_next_card`           | Pega **atomicamente** o card do topo de uma lista, atribui a você e move para outra (respeita WIP)                  |
| `set_custom_field`          | Define ou limpa um campo personalizado pelo nome (ex.: `PR`, `Branch`, `Prioridade`)                                |
| `create_card_from_template` | Cria card a partir de um template do board (descrição + checklist)                                                  |

Não existe ferramenta de exclusão definitiva: cards só são arquivados (`update_card` com `archived: true`).

## Estrutura

```
src/
├── index.ts    # entry point stdio (logs só em stderr — stdout é o protocolo)
├── server.ts   # McpServer + instruções para o modelo
├── tools.ts    # definição das ferramentas (schemas zod) e tratamento de erros
├── client.ts   # cliente HTTP da API; converte erros em FlowboardError com mensagem clara
├── resolve.ts  # resolução de board/lista/label/usuário por nome, datas
├── format.ts   # renderização em texto compacto
└── config.ts   # variáveis de ambiente
test/           # Vitest: FakeApi (fetch mockado) + cliente MCP real via InMemoryTransport
```
