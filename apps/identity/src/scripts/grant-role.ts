import 'reflect-metadata';
import { normalizePhone } from '@am/contracts';
import { PlatformRole } from '@am/auth';
import { createCliDataSource } from '@am/database';
import { AuditService } from '../audit/audit.service';
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
    const phone = normalizePhone(who);
    const roles = await db.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: phone ? { phone } : { email: who.trim() },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw new Error(`No account with ${phone ?? who}; they must sign up first`);

      const next = new Set(user.roles);
      if (revoke) next.delete(role as PlatformRole);
      else next.add(role as PlatformRole);
      await manager.update(User, { id: user.id }, { roles: [...next] });
      // On the audit log with no actor: it was run on the server, not done by an admin in the app.
      await new AuditService(db).record(
        manager,
        {
          actorId: null,
          action: revoke ? 'user.role_revoked' : 'user.role_granted',
          subjectType: 'user',
          subjectId: user.id,
          shopId: null,
          details: { role },
        },
        { source: 'identity-cli' },
      );
      return { id: user.id, roles: [...next] };
    });
    console.log(`${roles.id}: roles are now ${roles.roles.join(', ') || '(none)'}`);
  } finally {
    await db.destroy();
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
