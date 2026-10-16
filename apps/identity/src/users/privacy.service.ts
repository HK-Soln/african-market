import { DataSource } from 'typeorm';
import {
  ACCOUNT_ERASURE_DAYS,
  DeleteMeRequest,
  DeleteMeResponse,
  ExportMeRequest,
  IdentityErrors,
  PersonalDataExport,
} from '@am/contracts';
import { OutboxService } from '@am/database';
import { Address, Credential, Session, ShopMember, User } from '../entities';
import { identityError } from '../errors';
import { SessionService } from '../sessions/session.service';

/** Deleting the account needs a sign-in at most this old: a borrowed or stolen session is not enough. */
export const REAUTH_MAX_AGE_SECONDS = 10 * 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (date: Date | null) => (date ? date.toISOString() : null);

/**
 * The person's rights over their own data (UAE PDPL): a copy of everything identity holds, and
 * deleting the account. Deletion closes the account at once; AccountErasure removes the personal
 * data ACCOUNT_ERASURE_DAYS later.
 */
export class PrivacyService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
    private readonly sessions: SessionService,
  ) {}

  /** Also for a suspended account: suspension does not take away the right to a copy. */
  async exportMe(input: ExportMeRequest): Promise<PersonalDataExport> {
    const manager = this.dataSource.manager;
    const user = await manager.findOneBy(User, { id: input.userId });
    if (!user) throw identityError(IdentityErrors.userNotFound);

    const [credentials, sessions, addresses, memberships] = await Promise.all([
      manager.find(Credential, { where: { userId: user.id }, order: { createdAt: 'ASC' } }),
      manager.find(Session, { where: { userId: user.id }, order: { createdAt: 'ASC' } }),
      manager.find(Address, { where: { userId: user.id }, order: { createdAt: 'ASC' } }),
      manager.find(ShopMember, { where: { userId: user.id }, order: { createdAt: 'ASC' } }),
    ]);

    return {
      format: 'african-market.identity/1',
      exportedAt: new Date().toISOString(),
      account: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        name: user.name,
        preferredLanguage: user.preferredLanguage,
        homeEmirate: user.homeEmirate,
        roles: user.roles,
        createdAt: user.createdAt.toISOString(),
        phoneVerifiedAt: iso(user.phoneVerifiedAt),
        emailVerifiedAt: iso(user.emailVerifiedAt),
      },
      consents: {
        termsVersion: user.termsVersion,
        termsAcceptedAt: iso(user.termsAcceptedAt),
        privacyVersion: user.privacyVersion,
        marketingConsentAt: iso(user.marketingConsentAt),
      },
      signInMethods: credentials.map((c) => ({ type: c.type, addedAt: c.createdAt.toISOString() })),
      sessions: signIns(sessions),
      addresses: addresses.map((a) => ({
        label: a.label,
        emirate: a.emirate,
        area: a.area,
        building: a.building,
        flat: a.flat,
        makani: a.makani,
        location: a.location ? [a.location.coordinates[0], a.location.coordinates[1]] : null,
        notes: a.notes,
        createdAt: a.createdAt.toISOString(),
      })),
      shopMemberships: memberships.map((m) => ({
        shopId: m.shopId,
        role: m.role,
        branchIds: m.branchIds,
        since: m.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Closes the account: nobody can sign in to it, every session ends, and `user.deleted` tells the
   * other services to hide what the person published and to erase their copies by `eraseBy`.
   * The phone and email are free for a new account straight away.
   */
  async deleteMe(input: DeleteMeRequest): Promise<DeleteMeResponse> {
    const signedInSecondsAgo =
      input.authTime === undefined ? Infinity : Date.now() / 1000 - input.authTime;
    if (signedInSecondsAgo > REAUTH_MAX_AGE_SECONDS) {
      throw identityError(IdentityErrors.reauthRequired, {
        maxAgeSeconds: REAUTH_MAX_AGE_SECONDS,
      });
    }

    return this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { id: input.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) throw identityError(IdentityErrors.userNotFound);

      const deletedAt = new Date();
      const eraseBy = new Date(deletedAt.getTime() + ACCOUNT_ERASURE_DAYS * DAY_MS);
      await manager.update(User, { id: user.id }, { status: 'deleted', deletedAt });
      await this.sessions.revokeAllForUser(manager, user.id);
      await this.outbox.enqueue(
        manager,
        'user.deleted',
        { userId: user.id, deletedAt: deletedAt.toISOString(), eraseBy: eraseBy.toISOString() },
        input.correlationId,
      );
      return { deletedAt: deletedAt.toISOString(), erasedAfter: eraseBy.toISOString() };
    });
  }
}

/** Session rows grouped into sign-ins: one family is one sign-in, refreshed many times. */
function signIns(rows: Session[]): PersonalDataExport['sessions'] {
  const families = new Map<string, Session[]>();
  for (const row of rows) families.set(row.familyId, [...(families.get(row.familyId) ?? []), row]);
  return [...families.values()].map((family) => {
    const latest = family[family.length - 1];
    return {
      signedInAt: family[0].authenticatedAt.toISOString(),
      lastActiveAt: latest.createdAt.toISOString(),
      expiresAt: latest.expiresAt.toISOString(),
      signedOutAt: iso(latest.revokedAt),
      ip: latest.ip,
      userAgent: latest.userAgent,
    };
  });
}
