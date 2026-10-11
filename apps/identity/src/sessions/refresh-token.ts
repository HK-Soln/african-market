import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes, URL-safe. This is the only time the token exists in the clear. */
export const generateRefreshToken = (): string => randomBytes(32).toString('base64url');

/**
 * SHA-256 of the token. A plain fast hash is right here, unlike for passwords: the token is 256
 * bits of randomness, so there is nothing to guess, and the lookup has to be by exact hash.
 */
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
