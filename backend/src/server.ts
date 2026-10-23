import { buildApp } from './app.js';
import { env } from './env.js';
import { prisma } from './lib/prisma.js';

const app = await buildApp();

async function shutdown(signal: string): Promise<void> {
  app.log.info(`Received ${signal}, shutting down`);
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: env.port, host: env.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
