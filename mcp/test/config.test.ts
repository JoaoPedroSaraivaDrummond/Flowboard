import { describe, expect, it } from 'vitest';
import { DEFAULT_API_URL, loadConfig } from '../src/config.js';
import { normalizeName, parseDueDate } from '../src/resolve.js';

describe('loadConfig', () => {
  it('uses the default URL and reads the token', () => {
    expect(loadConfig({ FLOWBOARD_TOKEN: ' fb_abc ' })).toEqual({
      apiUrl: DEFAULT_API_URL,
      token: 'fb_abc',
    });
  });

  it('strips trailing slashes from the URL', () => {
    expect(loadConfig({ FLOWBOARD_API_URL: 'http://host:1/api//' }).apiUrl).toBe(
      'http://host:1/api',
    );
  });

  it('treats an unexpanded ${VAR} placeholder (unset in .mcp.json) as missing', () => {
    expect(
      loadConfig({ FLOWBOARD_TOKEN: '${FLOWBOARD_TOKEN}', FLOWBOARD_API_URL: '${X}' }),
    ).toEqual({
      apiUrl: DEFAULT_API_URL,
      token: null,
    });
  });
});

describe('helpers', () => {
  it('normalizes names for case/accent-insensitive matching', () => {
    expect(normalizeName('  Em   PROGRESSO ')).toBe('em progresso');
    expect(normalizeName('Revisão')).toBe(normalizeName('revisao'));
    expect(normalizeName('Concluído')).toBe('concluido');
  });

  it('parses due dates', () => {
    expect(parseDueDate('2026-11-30')).toBe(new Date('2026-11-30T23:59:59').toISOString());
    expect(parseDueDate('2026-11-30T10:00:00Z')).toBe('2026-11-30T10:00:00.000Z');
    expect(() => parseDueDate('amanhã')).toThrow(/Invalid dueDate/);
  });
});
