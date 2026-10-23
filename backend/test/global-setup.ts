import { execSync } from 'node:child_process';

/** Creates the test database if needed and applies all migrations. */
export default function setup(): void {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL is not set (see vitest.config.ts)');
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}
