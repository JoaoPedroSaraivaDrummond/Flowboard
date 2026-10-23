export const DEFAULT_API_URL = 'http://localhost:3333/api';

export type Config = {
  apiUrl: string;
  token: string | null;
};

/**
 * Claude Code passes `${VAR}` through literally when a variable referenced in .mcp.json is unset,
 * so treat that (and blank values) as missing.
 */
function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || /^\$\{[^}]*\}$/.test(trimmed)) return undefined;
  return trimmed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    apiUrl: (clean(env.FLOWBOARD_API_URL) ?? DEFAULT_API_URL).replace(/\/+$/, ''),
    token: clean(env.FLOWBOARD_TOKEN) ?? null,
  };
}
