import { defineConfig } from 'vitest/config';

/**
 * Tests run against a dedicated database: TEST_DATABASE_URL, or DATABASE_URL with the database
 * name suffixed by `_test`. It is migrated in global setup and truncated before each test.
 */
function resolveTestDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!process.env.DATABASE_URL) throw new Error('Set TEST_DATABASE_URL or DATABASE_URL');
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}

const testDatabaseUrl = resolveTestDatabaseUrl();
// Visible to globalSetup, which runs in this process.
process.env.TEST_DATABASE_URL = testDatabaseUrl;
if (testDatabaseUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL (tests wipe the database)');
}

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // All test files share one database.
    fileParallelism: false,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      TEST_DATABASE_URL: testDatabaseUrl,
      JWT_SECRET: 'test-secret-at-least-16-chars',
      LOG_LEVEL: 'silent',
    },
  },
});
