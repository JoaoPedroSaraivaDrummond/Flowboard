import { createHash, randomBytes } from 'node:crypto';

export const API_TOKEN_PREFIX = 'fb_';

export function generateApiToken(): string {
  return API_TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

/** API tokens have 256 bits of entropy, so a fast hash (no salt/KDF) is enough. */
export function hashApiToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function isApiToken(token: string): boolean {
  return token.startsWith(API_TOKEN_PREFIX);
}
