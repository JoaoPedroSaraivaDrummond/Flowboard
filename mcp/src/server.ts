import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FlowboardClient } from './client.js';
import { registerTools } from './tools.js';

export const SERVER_VERSION = '0.2.0';

const INSTRUCTIONS = `Flowboard is a Trello-like board (boards → lists → cards).
Typical flow: list_boards → get_board (shows lists and cards with ids) → get_card / create_card / move_card / update_card.
Ids appear in brackets as [board:…], [list:…], [card:…], [item:…]; pass the value after the colon.
Boards and lists can also be referenced by name. Nothing can be permanently deleted; cards are archived with update_card(archived: true).
Agent workflow: claim_next_card(board, "A Fazer", "Em Progresso") to take work (atomic, assigns it to you) → do the work, ticking items with toggle_checklist_item → set_custom_field(card, "PR", url) → move_card(card, "Revisão").
Lists may have a WIP limit (shown as "2/3 WIP") and on-enter automations; respect WIP errors instead of retrying.`;

export function createServer(client: FlowboardClient): McpServer {
  const server = new McpServer(
    { name: 'flowboard', version: SERVER_VERSION },
    { instructions: INSTRUCTIONS },
  );
  registerTools(server, client);
  return server;
}
