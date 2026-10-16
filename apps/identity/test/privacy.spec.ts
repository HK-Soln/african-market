import { randomUUID } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { AccessTokenClaims } from '@am/auth';
import { IdentityErrors, LEGAL_VERSIONS, SessionTokens } from '@am/contracts';
import { OutboxMessage, OutboxService } from '@am/database';
import { Address, OtpChallenge, Session, User } from '../src/entities';
import { OtpChallenges } from '../src/otp/otp-challenges';
import { OtpRateLimiter } from '../src/otp/otp-rate-limiter';
import { OtpService } from '../src/otp/otp.service';
import { SessionService } from '../src/sessions/session.service';
import { SmsMessage, SmsProvider } from '../src/sms/sms-provider';
import { AccountErasure } from '../src/users/account-erasure';
import { PrivacyService, REAUTH_MAX_AGE_SECONDS } from '../src/users/privacy.service';
import { createTestDatabase, TestDatabase } from './support/test-database';

const accessKey = `${randomUUID()}${randomUUID()}`;

class FakeSmsProvider implements SmsProvider {
  readonly sent: SmsMessage[] = [];
  async send(message: SmsMessage): Promise<void> {
    this.sent.push(message);
  }
  lastCodeFor(phone: string): string {
    const code = [...this.sent]
      .reverse()
      .find((m) => m.to === phone)
      ?.body.match(/\d{6}/)?.[0];
    if (!code) throw new Error(`No code was sent to ${phone}`);
    return code;
  }
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { getError?: () => { code: string } }).getError?.().code;
  }
}

let phoneSeq = 0;
const nextPhone = () => `+97154${String(1000000 + ++phoneSeq).padStart(7, '0')}`;
const DAY_MS = 24 * 60 * 60 * 1000;

describe('privacy: consent versions, export, deletion and erasure (Postgres)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let redis: Redis;
  let sessions: SessionService;
  let privacy: PrivacyService;
  const sms = new FakeSmsProvider();
  const runPrefix = `test:privacy:${randomUUID()}`;
  const verifier = new JwtService({ secret: accessKey });

  const claimsOf = (tokens: SessionTokens) =>
    verifier.verifyAsync<AccessTokenClaims & { iat: number }>(tokens.accessToken, {
      algorithms: ['HS256'],
    });

  const otp = () =>
    new OtpService(
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

  /** Signs a person in by phone (creating the account the first time). */
  const signIn = async (phone = nextPhone()) => {
    const service = otp();
    await service.requestOtp({ phone });
    const result = await service.verifyOtp({
      phone,
      code: sms.lastCodeFor(phone),
      termsAccepted: true,
      ip: '203.0.113.7',
      userAgent: 'Test browser',
    });
    return { phone, ...result, claims: await claimsOf(result.session) };
  };

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    sessions = new SessionService(db, accessKey, 0);
    privacy = new PrivacyService(db, new OutboxService('identity'), sessions);
  }, 60_000);

  afterAll(async () => {
    const keys = await redis.keys(`${runPrefix}:*`);
    if (keys.length) await redis.del(...keys);
    await redis.quit();
    await testDb?.drop();
  });

  describe('consent and sign-in time', () => {
    it('records which terms and privacy policy were accepted', async () => {
      const { user } = await signIn();
      const row = await db.getRepository(User).findOneByOrFail({ id: user.id });
      expect(row).toMatchObject({
        termsVersion: LEGAL_VERSIONS.terms,
        privacyVersion: LEGAL_VERSIONS.privacy,
      });
      expect(row.termsAcceptedAt).toBeInstanceOf(Date);
    });

    it('puts the sign-in time in the access token and keeps it across refreshes', async () => {
      const { session, claims } = await signIn();
      expect(Math.abs(claims.auth_time! - Date.now() / 1000)).toBeLessThan(10);

      await db.query(
        `UPDATE identity.session SET authenticated_at = authenticated_at - interval '1 hour'`,
      );
      const refreshed = await sessions.refresh({ refreshToken: session.refreshToken });
      expect((await claimsOf(refreshed.session)).auth_time).toBe(claims.auth_time! - 3600);
    });
  });

  describe('export', () => {
    it('gives the person everything identity holds about them, and no secrets', async () => {
      const { user, session, phone } = await signIn();
      await sessions.refresh({
        refreshToken: session.refreshToken,
        ip: '203.0.113.7',
        userAgent: 'Test browser',
      });
      await db.getRepository(Address).insert({
        userId: user.id,
        label: 'Home',
        emirate: 'DXB',
        area: 'Al Barsha',
        location: { type: 'Point', coordinates: [55.2, 25.1] },
      });

      const data = await privacy.exportMe({ userId: user.id });

      expect(data).toMatchObject({
        format: 'african-market.identity/1',
        account: { id: user.id, phone, roles: ['customer'] },
        consents: { termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy },
        signInMethods: [],
        addresses: [{ label: 'Home', emirate: 'DXB', location: [55.2, 25.1] }],
        shopMemberships: [],
      });
      // One sign-in, refreshed once, is one entry.
      expect(data.sessions).toEqual([
        expect.objectContaining({
          ip: '203.0.113.7',
          userAgent: 'Test browser',
          signedOutAt: null,
        }),
      ]);
      const text = JSON.stringify(data);
      expect(text).not.toMatch(/hash|secret|refreshToken|code/i);
    });

    it('answers USER_NOT_FOUND for an account that is gone', async () => {
      expect(await codeOf(privacy.exportMe({ userId: randomUUID() }))).toBe(
        IdentityErrors.userNotFound,
      );
    });
  });

  describe('deletion', () => {
    it('needs a recent sign-in', async () => {
      const { user, claims } = await signIn();
      expect(await codeOf(privacy.deleteMe({ userId: user.id }))).toBe(
        IdentityErrors.reauthRequired,
      );
      const stale = claims.auth_time! - REAUTH_MAX_AGE_SECONDS - 5;
      expect(await codeOf(privacy.deleteMe({ userId: user.id, authTime: stale }))).toBe(
        IdentityErrors.reauthRequired,
      );
      expect((await db.getRepository(User).findOneByOrFail({ id: user.id })).status).toBe('active');
    });

    it('closes the account, signs it out everywhere and tells the other services', async () => {
      const { user, session, claims, phone } = await signIn();
      const result = await privacy.deleteMe({
        userId: user.id,
        authTime: claims.auth_time,
        correlationId: 'req-delete',
      });

      const erasedAfter = new Date(result.erasedAfter).getTime();
      expect(erasedAfter - new Date(result.deletedAt).getTime()).toBe(30 * DAY_MS);
      const row = await db.getRepository(User).findOneOrFail({
        where: { id: user.id },
        withDeleted: true,
      });
      expect(row).toMatchObject({ status: 'deleted', phone });
      expect(row.deletedAt).toBeInstanceOf(Date);
      expect(await codeOf(sessions.refresh({ refreshToken: session.refreshToken }))).toBe(
        IdentityErrors.sessionInvalid,
      );

      const events = await db.getRepository(OutboxMessage).findBy({ name: 'user.deleted' });
      const event = events.find(
        (e) => (e.envelope as { payload: { userId: string } }).payload.userId === user.id,
      );
      expect(event?.envelope).toMatchObject({
        correlationId: 'req-delete',
        payload: { userId: user.id, deletedAt: result.deletedAt, eraseBy: result.erasedAfter },
      });

      // The same phone number starts a new account.
      const again = await signIn(phone);
      expect(again.isNewUser).toBe(true);
      expect(again.user.id).not.toBe(user.id);
    });
  });

  describe('erasure', () => {
    const erasure = () => new AccountErasure(db);

    it('erases a deleted account’s personal data after 30 days, and only then', async () => {
      const { user, claims, phone } = await signIn();
      await db.getRepository(Address).insert({ userId: user.id, emirate: 'SHJ', notes: 'Gate 2' });
      await privacy.deleteMe({ userId: user.id, authTime: claims.auth_time });

      await erasure().run();
      const waiting = await db
        .getRepository(User)
        .findOneOrFail({ where: { id: user.id }, withDeleted: true });
      expect(waiting).toMatchObject({ phone, erasedAt: null });

      await db.query(
        `UPDATE identity.user SET deleted_at = now() - interval '31 days' WHERE id = $1`,
        [user.id],
      );
      expect((await erasure().run()).erasedAccounts).toBeGreaterThanOrEqual(1);

      const erased = await db
        .getRepository(User)
        .findOneOrFail({ where: { id: user.id }, withDeleted: true });
      expect(erased).toMatchObject({
        phone: null,
        email: null,
        name: null,
        homeEmirate: null,
        marketingConsentAt: null,
        status: 'deleted',
        termsVersion: LEGAL_VERSIONS.terms,
      });
      expect(erased.erasedAt).toBeInstanceOf(Date);
      expect(await db.getRepository(Session).countBy({ userId: user.id })).toBe(0);
      expect(
        await db.getRepository(Address).count({ where: { userId: user.id }, withDeleted: true }),
      ).toBe(0);
      expect(await db.getRepository(OtpChallenge).countBy({ target: phone })).toBe(0);

      // Erased once: a second pass leaves it alone.
      await erasure().run();
      const later = await db
        .getRepository(User)
        .findOneOrFail({ where: { id: user.id }, withDeleted: true });
      expect(later.erasedAt?.getTime()).toBe(erased.erasedAt?.getTime());
    });

    it('deletes one-time codes older than a week for everyone', async () => {
      const { phone } = await signIn();
      await db.query(
        `UPDATE identity.otp_challenge SET created_at = now() - interval '8 days' WHERE target = $1`,
        [phone],
      );
      expect((await erasure().run()).removedCodes).toBeGreaterThanOrEqual(1);
      expect(await db.getRepository(OtpChallenge).countBy({ target: phone })).toBe(0);
    });
  });
});
