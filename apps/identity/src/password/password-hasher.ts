import * as argon2 from 'argon2';

/**
 * Argon2id with the OWASP-recommended minimum: 19 MiB of memory, 2 passes, 1 lane. The
 * parameters are stored inside each hash, so they can be raised later without a migration.
 */
const OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

/** False for a wrong password and for a stored value that is not a valid hash. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** True when a stored hash was made with weaker settings than today's and should be redone. */
export function passwordNeedsRehash(hash: string): boolean {
  return argon2.needsRehash(hash, OPTIONS);
}

let dummyHash: Promise<string> | undefined;

/**
 * Spends the same time as a real check when there is no account or no password to check
 * against, so response time does not reveal whether an email is registered.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('no-such-account-placeholder');
  await verifyPassword(await dummyHash, password);
}
