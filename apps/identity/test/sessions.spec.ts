import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { AccessTokenClaims } from '@am/auth';
import { IdentityErrors, SessionTokens } from '@am/contracts';
import { OutboxService } from '@am/database';
import { Session, ShopMember, User } from '../src/entities';
import { OtpChallenges } from '../src/otp/otp-challenges';
import { OtpRateLimiter } from '../src/otp/otp-rate-limiter';
import { OtpService } from '../src/otp/otp.service';
import { hashRefreshToken } from '../src/sessions/refresh-token';
import { SessionService } from '../src/sessions/session.service';
import { SmsMessage, SmsProvider } from '../src/sms/sms-provider';
import { UsersService } from '../src/users/users.service';
import { createTestDatabase, TestDatabase } from './support/test-database';

/** Generated per run; the services only need any 32+ character key. */
const accessKey = `${randomUUID()}${randomUUID()}`;

class FakeSmsProvider implements SmsProvider {
  readonly sent: SmsMessage[] = [];

  async send(message: SmsMessage): Promise<void> {
    this.sent.push(message);
  }

  lastCodeFor(phone: string): string {
    const message = [...this.sent].reverse().find((m) => m.to === phone);
    const code = message?.body.match(/\d{6}/)?.[0];
    if (!code) throw new Error(`No code was sent to ${phone}`);
    return code;
  }
}

/** The stable error code of a rejected service call. */
async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { getError?: () => { code: string } }).getError?.().code;
  }
}

let phoneSeq = 0;
const nextPhone = () => `+97152${String(1000000 + ++phoneSeq).padStart(7, '0')}`;

describe('sessions, tokens and the profile (Postgres + Redis)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let redis: Redis;
  let sms: FakeSmsProvider;
  let users: UsersService;
  const runPrefix = `test:sessions:${randomUUID()}`;
  const verifier = new JwtService({ secret: accessKey });

  /** `leeway` 0 is the strict rule: any second use of a refresh token is treated as theft. */
  const sessionsWith = (leeway = 0) => new SessionService(db, accessKey, leeway);

  /** Signs a new person up by phone, the way the app does, and returns what they were given. */
  const signUp = async (sessions: SessionService, context: { ip?: string; userAgent?: string }) => {
    const otp = new OtpService(
      db,
      new OtpRateLimiter(
        redis,
        {
          cooldownSeconds: 0,
          maxCooldownSeconds: 900,
          maxPerPhonePerHour: 100,
          maxPerIpPerHour: 100,
        },
        `${runPrefix}:${randomUUID()}`,
      ),
      sms,
      new OutboxService('identity'),
      new OtpChallenges(accessKey),
      sessions,
    );
    const phone = nextPhone();
    await otp.requestOtp({ phone });
    return otp.verifyOtp({
      phone,
      code: sms.lastCodeFor(phone),
      termsAccepted: true,
      preferredLanguage: 'ar',
      ...context,
    });
  };

  const claimsOf = (tokens: SessionTokens) =>
    verifier.verifyAsync<AccessTokenClaims & { iat: number; exp: number }>(tokens.accessToken, {
      algorithms: ['HS256'],
    });

  const rowFor = (refreshToken: string) =>
    db.getRepository(Session).findOneByOrFail({ refreshTokenHash: hashRefreshToken(refreshToken) });

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    users = new UsersService(db);
  }, 60_000);

  beforeEach(() => {
    sms = new FakeSmsProvider();
  });

  afterAll(async () => {
    const keys = await redis.keys(`${runPrefix}:*`);
    if (keys.length) await redis.del(...keys);
    await redis.quit();
    await testDb?.drop();
  });

  describe('signing in', () => {
    it('returns a 15-minute access token with the claims the gateway reads', async () => {
      const { user, session } = await signUp(sessionsWith(), {});
      const claims = await claimsOf(session);

      expect(claims.sub).toBe(user.id);
      expect(claims.roles).toEqual(['customer']);
      expect(claims.shops).toEqual([]);
      expect(claims.locale).toBe('ar');
      expect(claims.exp - claims.iat).toBe(15 * 60);
      const lifetimeMs = new Date(session.accessTokenExpiresAt).getTime() - Date.now();
      expect(lifetimeMs).toBeGreaterThan(14 * 60_000);
      expect(lifetimeMs).toBeLessThanOrEqual(15 * 60_000);
    });

    it('rejects an access token signed with another key', async () => {
      const { session } = await signUp(sessionsWith(), {});
      const other = new JwtService({ secret: `${randomUUID()}${randomUUID()}` });
      await expect(other.verifyAsync(session.accessToken)).rejects.toThrow();
    });

    it('stores only a hash of the 30-day refresh token, with where it came from', async () => {
      const { user, session } = await signUp(sessionsWith(), {
        ip: '203.0.113.9',
        userAgent: 'Mozilla/5.0 (test)',
      });

      expect(Buffer.from(session.refreshToken, 'base64url')).toHaveLength(32);
      const rows = await db.getRepository(Session).findBy({ userId: user.id });
      expect(rows).toHaveLength(1);
      expect(rows[0].refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(rows[0].refreshTokenHash).not.toContain(session.refreshToken);
      expect(rows[0].ip).toBe('203.0.113.9');
      expect(rows[0].userAgent).toBe('Mozilla/5.0 (test)');
      const days = (rows[0].expiresAt.getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThanOrEqual(30);
    });

    it('drops an address that is not an IP instead of failing the sign-in', async () => {
      const { session } = await signUp(sessionsWith(), {
        ip: 'not-an-ip',
        userAgent: 'x'.repeat(2000),
      });
      const row = await rowFor(session.refreshToken);
      expect(row.ip).toBeNull();
      expect(row.userAgent).toHaveLength(512);
    });
  });

  describe('refreshing', () => {
    it('gives a new pair and keeps the session in the same family', async () => {
      const sessions = sessionsWith();
      const first = await signUp(sessions, {});
      const second = await sessions.refresh({ refreshToken: first.session.refreshToken });

      expect(second.user.id).toBe(first.user.id);
      expect(second.session.refreshToken).not.toBe(first.session.refreshToken);
      const oldRow = await rowFor(first.session.refreshToken);
      const newRow = await rowFor(second.session.refreshToken);
      expect(newRow.familyId).toBe(oldRow.familyId);
      expect(oldRow.replacedBy).toBe(newRow.id);
      expect(oldRow.revokedAt).toBeNull();

      // The new token keeps working, again and again.
      const third = await sessions.refresh({ refreshToken: second.session.refreshToken });
      expect((await claimsOf(third.session)).sub).toBe(first.user.id);
    });

    it('signs the whole family out when a replaced token comes back', async () => {
      const sessions = sessionsWith();
      const first = await signUp(sessions, {});
      const second = await sessions.refresh({ refreshToken: first.session.refreshToken });

      expect(await codeOf(sessions.refresh({ refreshToken: first.session.refreshToken }))).toBe(
        IdentityErrors.sessionReused,
      );
      // The token the real owner holds stops working too: someone else has a copy.
      expect(await codeOf(sessions.refresh({ refreshToken: second.session.refreshToken }))).toBe(
        IdentityErrors.sessionInvalid,
      );
      const family = await db
        .getRepository(Session)
        .findBy({ familyId: (await rowFor(first.session.refreshToken)).familyId });
      expect(family).toHaveLength(2);
      expect(family.every((row) => row.revokedAt)).toBe(true);
    });

    it('leaves the same person signed in on another device', async () => {
      const sessions = sessionsWith();
      const phoneOne = await signUp(sessions, {});
      const user = await db.getRepository(User).findOneByOrFail({ id: phoneOne.user.id });
      const laptop = await db.transaction((manager) => sessions.start(manager, user, {}));

      await sessions.refresh({ refreshToken: phoneOne.session.refreshToken });
      await codeOf(sessions.refresh({ refreshToken: phoneOne.session.refreshToken }));

      const again = await sessions.refresh({ refreshToken: laptop.refreshToken });
      expect(again.user.id).toBe(user.id);
    });

    it('lets two tabs that refresh at the same moment both carry on', async () => {
      const sessions = sessionsWith(10);
      const first = await signUp(sessions, {});

      const [a, b] = await Promise.all([
        sessions.refresh({ refreshToken: first.session.refreshToken }),
        sessions.refresh({ refreshToken: first.session.refreshToken }),
      ]);

      expect(a.session.refreshToken).not.toBe(b.session.refreshToken);
      await sessions.refresh({ refreshToken: a.session.refreshToken });
      await sessions.refresh({ refreshToken: b.session.refreshToken });
    });

    it('treats a replaced token as stolen once the short allowance has passed', async () => {
      const sessions = sessionsWith(10);
      const first = await signUp(sessions, {});
      const second = await sessions.refresh({ refreshToken: first.session.refreshToken });
      const successor = await rowFor(second.session.refreshToken);
      await db.query(
        `UPDATE identity.session SET created_at = now() - interval '11 seconds' WHERE id = $1`,
        [successor.id],
      );

      expect(await codeOf(sessions.refresh({ refreshToken: first.session.refreshToken }))).toBe(
        IdentityErrors.sessionReused,
      );
    });

    it('refuses an unknown or expired token', async () => {
      const sessions = sessionsWith();
      expect(await codeOf(sessions.refresh({ refreshToken: 'never-issued' }))).toBe(
        IdentityErrors.sessionInvalid,
      );

      const { session } = await signUp(sessions, {});
      await db
        .getRepository(Session)
        .update(
          { refreshTokenHash: hashRefreshToken(session.refreshToken) },
          { expiresAt: new Date(Date.now() - 1000) },
        );
      expect(await codeOf(sessions.refresh({ refreshToken: session.refreshToken }))).toBe(
        IdentityErrors.sessionInvalid,
      );
    });

    it('refuses a suspended user and signs that session out', async () => {
      const sessions = sessionsWith();
      const { user, session } = await signUp(sessions, {});
      await db.getRepository(User).update({ id: user.id }, { status: 'suspended' });

      expect(await codeOf(sessions.refresh({ refreshToken: session.refreshToken }))).toBe(
        IdentityErrors.userSuspended,
      );
      expect((await rowFor(session.refreshToken)).revokedAt).toBeInstanceOf(Date);
    });

    it('picks up new roles and shop memberships in the next access token', async () => {
      const sessions = sessionsWith();
      const first = await signUp(sessions, {});
      const shopId = randomUUID();
      const branchId = randomUUID();
      await db.getRepository(User).update({ id: first.user.id }, { roles: ['customer', 'seller'] });
      await db
        .getRepository(ShopMember)
        .insert({ userId: first.user.id, shopId, role: 'staff', branchIds: [branchId] });

      const second = await sessions.refresh({ refreshToken: first.session.refreshToken });
      const claims = await claimsOf(second.session);
      expect(claims.roles).toEqual(['customer', 'seller']);
      expect(claims.shops).toEqual([{ shopId, role: 'staff', branchIds: [branchId] }]);
    });
  });

  describe('signing out', () => {
    it('ends the session, even through a token that was already replaced', async () => {
      const sessions = sessionsWith();
      const first = await signUp(sessions, {});
      const second = await sessions.refresh({ refreshToken: first.session.refreshToken });

      expect(await sessions.logout({ refreshToken: second.session.refreshToken })).toEqual({
        loggedOut: true,
      });
      expect(await codeOf(sessions.refresh({ refreshToken: second.session.refreshToken }))).toBe(
        IdentityErrors.sessionInvalid,
      );
    });

    it('answers the same for a token it has never seen', async () => {
      expect(await sessionsWith().logout({ refreshToken: 'never-issued' })).toEqual({
        loggedOut: true,
      });
    });
  });

  describe('the profile', () => {
    it('returns the signed-in person with their shops', async () => {
      const { user } = await signUp(sessionsWith(), {});
      const shopId = randomUUID();
      await db.getRepository(ShopMember).insert({ userId: user.id, shopId, role: 'owner' });

      const me = await users.getMe({ userId: user.id });
      expect(me.user).toMatchObject({
        id: user.id,
        preferredLanguage: 'ar',
        homeEmirate: null,
        marketingConsent: false,
        phoneVerified: true,
      });
      expect(me.shops).toEqual([{ shopId, role: 'owner', branchIds: [] }]);
    });

    it('changes only the fields that were sent', async () => {
      const { user } = await signUp(sessionsWith(), {});

      const named = await users.updateMe({ userId: user.id, name: '  Amina Diallo  ' });
      expect(named.user.name).toBe('Amina Diallo');
      expect(named.user.preferredLanguage).toBe('ar');

      const moved = await users.updateMe({
        userId: user.id,
        preferredLanguage: 'fr',
        homeEmirate: 'SHJ',
      });
      expect(moved.user).toMatchObject({
        name: 'Amina Diallo',
        preferredLanguage: 'fr',
        homeEmirate: 'SHJ',
      });

      const cleared = await users.updateMe({ userId: user.id, name: '', homeEmirate: null });
      expect(cleared.user.name).toBeNull();
      expect(cleared.user.homeEmirate).toBeNull();
    });

    it('records marketing consent with its time and lets it be withdrawn', async () => {
      const { user } = await signUp(sessionsWith(), {});

      expect(
        (await users.updateMe({ userId: user.id, marketingConsent: true })).user,
      ).toMatchObject({ marketingConsent: true });
      const given = (await db.getRepository(User).findOneByOrFail({ id: user.id }))
        .marketingConsentAt;
      expect(given).toBeInstanceOf(Date);

      // Saying yes again keeps the time it was first given.
      await users.updateMe({ userId: user.id, marketingConsent: true });
      const again = (await db.getRepository(User).findOneByOrFail({ id: user.id }))
        .marketingConsentAt;
      expect(again?.getTime()).toBe(given?.getTime());

      const withdrawn = await users.updateMe({ userId: user.id, marketingConsent: false });
      expect(withdrawn.user.marketingConsent).toBe(false);
    });

    it('refuses a language or emirate it does not know, and an over-long name', async () => {
      const { user } = await signUp(sessionsWith(), {});
      for (const patch of [
        { preferredLanguage: 'de' },
        { homeEmirate: 'XXX' },
        { name: 'n'.repeat(121) },
      ]) {
        expect(await codeOf(users.updateMe({ userId: user.id, ...patch }))).toBe(
          IdentityErrors.validationFailed,
        );
      }
    });

    it('refuses an unknown or suspended user', async () => {
      expect(await codeOf(users.getMe({ userId: randomUUID() }))).toBe(IdentityErrors.userNotFound);

      const { user } = await signUp(sessionsWith(), {});
      await db.getRepository(User).update({ id: user.id }, { status: 'suspended' });
      expect(await codeOf(users.getMe({ userId: user.id }))).toBe(IdentityErrors.userSuspended);
      expect(await codeOf(users.updateMe({ userId: user.id, name: 'x' }))).toBe(
        IdentityErrors.userSuspended,
      );
    });
  });
});
