import 'reflect-metadata';
import { normalizePhone } from '@am/contracts';
import { PlatformRole } from '@am/auth';
import { createCliDataSource } from '@am/database';
import { dataSourceConfig } from '../data-source';
import { User } from '../entities';

/**
 * Gives a platform role to an existing account, or takes it away. The first admin has to be
 * made this way: nothing in the apps hands out the admin role.
 *
 *   pnpm --filter @am/identity grant-role <phone or email> admin            (locally, after build)
 *   pnpm --filter @am/identity grant-role <phone or email> admin --revoke
 *
 * In AWS, run the identity image as a one-off task with the command
 * `node dist/scripts/grant-role.js <phone or email> admin`.
 *
 * The person must have signed up first. The role is in their access token from their next token
 * refresh (at most 15 minutes), or at once if they sign out and in again.
 */
const ROLES: readonly PlatformRole[] = ['customer', 'seller', 'admin'];

async function main(argv: string[]): Promise<void> {
  const [who, role, flag] = argv;
  const revoke = flag === '--revoke';
  if (!who || !ROLES.includes(role as PlatformRole) || (flag && !revoke)) {
    throw new Error('Usage: grant-role <phone or email> <customer|seller|admin> [--revoke]');
  }

  const db = await createCliDataSource(dataSourceConfig).initialize();
  try {
    const users = db.getRepository(User);
    const phone = normalizePhone(who);
    const user = await users.findOneBy(phone ? { phone } : { email: who.trim() });
    if (!user) throw new Error(`No account with ${phone ?? who}; they must sign up first`);

    const roles = new Set(user.roles);
    if (revoke) roles.delete(role as PlatformRole);
    else roles.add(role as PlatformRole);
    await users.update({ id: user.id }, { roles: [...roles] });
    console.log(`${user.id}: roles are now ${[...roles].join(', ') || '(none)'}`);
  } finally {
    await db.destroy();
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
