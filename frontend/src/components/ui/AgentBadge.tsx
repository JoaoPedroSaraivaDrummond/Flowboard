import { BotIcon } from './icons';

/** Marks actions/comments made by an agent user (e.g. Claude Code via MCP). */
export function AgentBadge() {
  return (
    <span
      title="Ação feita por um agente (token de API)"
      className="inline-flex items-center gap-0.5 rounded bg-violet-100 px-1 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-violet-700 dark:bg-violet-900/60 dark:text-violet-200"
    >
      <BotIcon className="h-3 w-3" /> agente
    </span>
  );
}
