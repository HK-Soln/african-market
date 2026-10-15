import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { IdentityErrors } from '@am/contracts';
import { OutboxMessage, OutboxService } from '@am/database';
import { OtpChallenge, User } from '../src/entities';
import { OtpChallenges } from '../src/otp/otp-challenges';
import { OtpRateLimiter, OtpRateLimits } from '../src/otp/otp-rate-limiter';
import { OtpTestNumbers } from '../src/otp/otp-test-numbers';
import { OtpService } from '../src/otp/otp.service';
import { SessionService } from '../src/sessions/session.service';
import { SmsMessage, SmsProvider } from '../src/sms/sms-provider';
import { createTestDatabase, TestDatabase } from './support/test-database';

/** Generated per run; the service only needs any 32+ character key. */
const hmacKey = `${randomUUID()}${randomUUID()}`;

/** Captures messages instead of sending them, and can be told to fail. */
class FakeSmsProvider implements SmsProvider {
  readonly sent: SmsMessage[] = [];
  failNext = false;

  async send(message: SmsMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('carrier unavailable');
    }
    this.sent.push(message);
  }

  /** The code inside the most recent message to this phone. */
  lastCodeFor(phone: string): string {
    const message = [...this.sent].reverse().find((m) => m.to === phone);
    const code = message?.body.match(/\d{6}/)?.[0];
    if (!code) throw new Error(`No code was sent to ${phone}`);
    return code;
  }
}

/** The stable error code of a rejected service call. */
async function errorCode(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { getError?: () => { code: string } }).getError?.().code;
  }
}

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return (
      err as { getError: () => { status: number; code: string; details?: unknown } }
    ).getError();
  }
  throw new Error('Expected the call to fail');
}

let phoneSeq = 0;
/** A fresh, valid UAE mobile number for each test. */
const nextPhone = () => `+97150${String(1000000 + ++phoneSeq).padStart(7, '0')}`;

describe('phone OTP sign-up and sign-in (Postgres + Redis)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let redis: Redis;
  let sms: FakeSmsProvider;
  const runPrefix = `test:otp:${randomUUID()}`;

  /** A service with its own Redis key space, so tests cannot trip each other's limits. */
  const serviceWith = (
    limits: Partial<OtpRateLimits> = {},
    testNumbers: OtpTestNumbers = OtpTestNumbers.none(),
  ) =>
    new OtpService(
      db,
      new OtpRateLimiter(
        redis,
        {
          cooldownSeconds: 0,
          maxCooldownSeconds: 900,
          maxPerPhonePerHour: 100,
          maxPerIpPerHour: 100,
          ...limits,
        },
        `${runPrefix}:${randomUUID()}`,
      ),
      sms,
      new OutboxService('identity'),
      new OtpChallenges(hmacKey),
      new SessionService(db, hmacKey),
      testNumbers,
    );

  const registeredEvents = async (userId: string) =>
    (await db.getRepository(OutboxMessage).findBy({ name: 'user.registered' })).filter(
      (row) => (row.envelope as { payload: { userId: string } }).payload.userId === userId,
    );

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
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

  describe('test numbers (staging end-to-end tests)', () => {
    it('gives a test number its fixed code without sending anything, once', async () => {
      const phone = nextPhone();
      const otp = serviceWith({}, OtpTestNumbers.parse(`${phone}:246810`));

      await otp.requestOtp({ phone, locale: 'en' });
      expect(sms.sent).toHaveLength(0);

      expect(await errorCode(otp.verifyOtp({ phone, code: '135791', termsAccepted: true }))).toBe(
        IdentityErrors.otpInvalid,
      );
      const verified = await otp.verifyOtp({ phone, code: '246810', termsAccepted: true });
      expect(verified.isNewUser).toBe(true);
      // Used once, like any code.
      expect(await errorCode(otp.verifyOtp({ phone, code: '246810' }))).toBe(
        IdentityErrors.otpExpired,
      );
    });

    it('sends a real, random code to every other number', async () => {
      const phone = nextPhone();
      const otp = serviceWith({}, OtpTestNumbers.parse('+971500000099:246810'));
      await otp.requestOtp({ phone, locale: 'en' });
      expect(sms.lastCodeFor(phone)).toMatch(/^\d{6}$/);
    });
  });

  describe('requesting a code', () => {
    it('normalises the phone, sends a six-digit code and stores only its hash', async () => {
      const otp = serviceWith();
      const result = await otp.requestOtp({ phone: '050 765 4321', locale: 'en' });

      expect(result.phone).toBe('+971507654321');
      expect(result.channel).toBe('whatsapp');
      expect(result.resendAfterSeconds).toBe(0);
      const lifetimeMs = new Date(result.expiresAt).getTime() - Date.now();
      expect(lifetimeMs).toBeGreaterThan(4 * 60_000);
      expect(lifetimeMs).toBeLessThanOrEqual(5 * 60_000);

      const code = sms.lastCodeFor('+971507654321');
      const challenge = await db
        .getRepository(OtpChallenge)
        .findOneByOrFail({ target: '+971507654321' });
      expect(challenge.purpose).toBe('signup');
      expect(challenge.codeHash).toMatch(/^[0-9a-f]{64}$/);
      expect(challenge.codeHash).not.toContain(code);
    });

    it('sends the message in the requested language', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      await otp.requestOtp({ phone, locale: 'ar' });
      expect(sms.sent.at(-1)?.body).toContain('السوق الأفريقي');
      await otp.requestOtp({ phone, locale: 'fr' });
      expect(sms.sent.at(-1)?.body).toContain('Votre code');
    });

    it('rejects something that is not a phone number', async () => {
      expect(await errorCode(serviceWith().requestOtp({ phone: 'not a phone' }))).toBe(
        IdentityErrors.phoneInvalid,
      );
      expect(sms.sent).toHaveLength(0);
    });

    it('sends by SMS only when asked', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      expect((await otp.requestOtp({ phone, channel: 'sms' })).channel).toBe('sms');
      expect(sms.sent.at(-1)?.channel).toBe('sms');
      await otp.requestOtp({ phone });
      expect(sms.sent.at(-1)?.channel).toBe('whatsapp');
    });

    it('refuses a resend during the cooldown', async () => {
      const otp = serviceWith({ cooldownSeconds: 30 });
      const phone = nextPhone();
      expect((await otp.requestOtp({ phone })).resendAfterSeconds).toBe(30);
      const error = await errorOf(otp.requestOtp({ phone }));
      expect(error.status).toBe(429);
      expect(error.code).toBe(IdentityErrors.otpResendTooSoon);
      const { retryAfterSeconds } = error.details as { retryAfterSeconds: number };
      expect(retryAfterSeconds).toBeGreaterThan(0);
      expect(retryAfterSeconds).toBeLessThanOrEqual(30);
      expect(sms.sent).toHaveLength(1);
    });

    it('doubles the wait with every code sent, up to the cap', async () => {
      const prefix = `${runPrefix}:${randomUUID()}`;
      const limits = {
        cooldownSeconds: 30,
        maxCooldownSeconds: 100,
        maxPerPhonePerHour: 100,
        maxPerIpPerHour: 100,
      };
      const limiter = new OtpRateLimiter(redis, limits, prefix);
      const phone = nextPhone();
      const waits: number[] = [];
      for (let i = 0; i < 4; i++) {
        waits.push((await limiter.consume(phone)).resendAfterSeconds);
        // Stand in for the wait having passed, without sleeping through it.
        const [cooldownKey] = await redis.keys(`${prefix}:cooldown:*`);
        expect(await redis.ttl(cooldownKey)).toBeGreaterThan(waits[i] - 5);
        await redis.del(cooldownKey);
      }
      expect(waits).toEqual([30, 60, 100, 100]);
    });

    it('keeps a separate timer for each purpose', async () => {
      const limiter = new OtpRateLimiter(
        redis,
        {
          cooldownSeconds: 30,
          maxCooldownSeconds: 900,
          maxPerPhonePerHour: 5,
          maxPerIpPerHour: 100,
        },
        `${runPrefix}:${randomUUID()}`,
      );
      const target = 'someone@example.com';
      await limiter.consume(target, undefined, 'email-verify');
      expect(await errorCode(limiter.consume(target, undefined, 'email-verify'))).toBe(
        IdentityErrors.otpResendTooSoon,
      );
      expect((await limiter.consume(target, undefined, 'email-reset')).resendAfterSeconds).toBe(30);
    });

    it('does not count a refused resend against the hourly allowance', async () => {
      const prefix = `${runPrefix}:${randomUUID()}`;
      const limiter = new OtpRateLimiter(
        redis,
        {
          cooldownSeconds: 30,
          maxCooldownSeconds: 900,
          maxPerPhonePerHour: 2,
          maxPerIpPerHour: 100,
        },
        prefix,
      );
      const phone = nextPhone();
      await limiter.consume(phone);
      for (let i = 0; i < 5; i++)
        expect(await errorCode(limiter.consume(phone))).toBe(IdentityErrors.otpResendTooSoon);
      await redis.del(...(await redis.keys(`${prefix}:cooldown:*`)));
      await limiter.consume(phone);
    });

    it('allows five codes per phone per hour and refuses the sixth', async () => {
      const otp = serviceWith({ maxPerPhonePerHour: 5 });
      const phone = nextPhone();
      for (let i = 0; i < 5; i++) await otp.requestOtp({ phone });
      const error = await errorOf(otp.requestOtp({ phone }));
      expect(error.status).toBe(429);
      expect(error.code).toBe(IdentityErrors.otpRateLimited);
      expect(sms.sent).toHaveLength(5);
    });

    it('allows twenty codes per IP per hour across different phones', async () => {
      const otp = serviceWith({ maxPerIpPerHour: 20 });
      const ip = '203.0.113.9';
      for (let i = 0; i < 20; i++) await otp.requestOtp({ phone: nextPhone(), ip });
      expect(await errorCode(otp.requestOtp({ phone: nextPhone(), ip }))).toBe(
        IdentityErrors.otpRateLimited,
      );
      // Another network is unaffected.
      await otp.requestOtp({ phone: nextPhone(), ip: '198.51.100.4' });
    });

    it('leaves no usable code behind when sending fails', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      sms.failNext = true;
      const error = await errorOf(otp.requestOtp({ phone }));
      expect(error.status).toBe(502);
      expect(error.code).toBe(IdentityErrors.otpSendFailed);
      expect(await db.getRepository(OtpChallenge).countBy({ target: phone })).toBe(0);
    });
  });

  describe('verifying a code', () => {
    it('creates the user and queues user.registered in the same transaction', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      await otp.requestOtp({ phone });

      const result = await otp.verifyOtp({
        phone,
        code: sms.lastCodeFor(phone),
        preferredLanguage: 'ar',
        termsAccepted: true,
        marketingConsent: true,
        correlationId: 'req-123',
      });

      expect(result.isNewUser).toBe(true);
      expect(result.user).toMatchObject({
        phone,
        preferredLanguage: 'ar',
        roles: ['customer'],
        phoneVerified: true,
        emailVerified: false,
      });

      const user = await db.getRepository(User).findOneByOrFail({ id: result.user.id });
      expect(user.phoneVerifiedAt).toBeInstanceOf(Date);
      expect(user.termsAcceptedAt).toBeInstanceOf(Date);
      expect(user.marketingConsentAt).toBeInstanceOf(Date);

      const events = await registeredEvents(user.id);
      expect(events).toHaveLength(1);
      expect(events[0].envelope).toMatchObject({
        name: 'user.registered',
        source: 'identity',
        correlationId: 'req-123',
        payload: { userId: user.id, phone, preferredLanguage: 'ar' },
      });
      expect(events[0].publishedAt).toBeNull();
    });

    it('does not record marketing consent unless it was given', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      await otp.requestOtp({ phone });
      const { user } = await otp.verifyOtp({
        phone,
        code: sms.lastCodeFor(phone),
        termsAccepted: true,
      });
      const saved = await db.getRepository(User).findOneByOrFail({ id: user.id });
      expect(saved.marketingConsentAt).toBeNull();
      expect(saved.preferredLanguage).toBe('en');
    });

    it('refuses to create an account without the terms, and keeps the code usable', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      await otp.requestOtp({ phone });
      const code = sms.lastCodeFor(phone);

      expect(await errorCode(otp.verifyOtp({ phone, code }))).toBe(IdentityErrors.termsNotAccepted);
      expect(await db.getRepository(User).countBy({ phone })).toBe(0);

      const result = await otp.verifyOtp({ phone, code, termsAccepted: true });
      expect(result.isNewUser).toBe(true);
    });

    it('signs an existing user in without a second user.registered', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      await otp.requestOtp({ phone });
      const first = await otp.verifyOtp({
        phone,
        code: sms.lastCodeFor(phone),
        termsAccepted: true,
      });

      await otp.requestOtp({ phone });
      const challenge = await db
        .getRepository(OtpChallenge)
        .findOneOrFail({ where: { target: phone }, order: { createdAt: 'DESC' } });
      expect(challenge.purpose).toBe('login');

      const second = await otp.verifyOtp({ phone, code: sms.lastCodeFor(phone) });
      expect(second.isNewUser).toBe(false);
      expect(second.user.id).toBe(first.user.id);
      expect(await registeredEvents(first.user.id)).toHaveLength(1);
    });

    it('rejects a wrong code and counts the attempt', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      await otp.requestOtp({ phone });
      const right = sms.lastCodeFor(phone);
      const wrong = right === '000000' ? '000001' : '000000';

      const error = await errorOf(otp.verifyOtp({ phone, code: wrong, termsAccepted: true }));
      expect(error.code).toBe(IdentityErrors.otpInvalid);
      expect(error.details).toEqual({ attemptsLeft: 4 });
      const challenge = await db.getRepository(OtpChallenge).findOneByOrFail({ target: phone });
      expect(challenge.attempts).toBe(1);
      expect(challenge.consumedAt).toBeNull();
    });

    it('locks the code after five wrong attempts, even for the right code', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      await otp.requestOtp({ phone });
      const right = sms.lastCodeFor(phone);
      const wrong = right === '000000' ? '000001' : '000000';

      for (let i = 0; i < 5; i++)
        expect(await errorCode(otp.verifyOtp({ phone, code: wrong }))).toBe(
          IdentityErrors.otpInvalid,
        );
      const error = await errorOf(otp.verifyOtp({ phone, code: right, termsAccepted: true }));
      expect(error.status).toBe(429);
      expect(error.code).toBe(IdentityErrors.otpTooManyAttempts);
      expect(await db.getRepository(User).countBy({ phone })).toBe(0);
    });

    it('rejects an expired code', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      await otp.requestOtp({ phone });
      await db
        .getRepository(OtpChallenge)
        .update({ target: phone }, { expiresAt: new Date(Date.now() - 1000) });
      expect(
        await errorCode(
          otp.verifyOtp({ phone, code: sms.lastCodeFor(phone), termsAccepted: true }),
        ),
      ).toBe(IdentityErrors.otpExpired);
    });

    it('accepts a code once only', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      await otp.requestOtp({ phone });
      const code = sms.lastCodeFor(phone);
      await otp.verifyOtp({ phone, code, termsAccepted: true });
      expect(await errorCode(otp.verifyOtp({ phone, code }))).toBe(IdentityErrors.otpExpired);
    });

    it('invalidates the earlier code when a new one is requested', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      await otp.requestOtp({ phone });
      const first = sms.lastCodeFor(phone);
      await otp.requestOtp({ phone });
      const second = sms.lastCodeFor(phone);

      if (first !== second)
        expect(await errorCode(otp.verifyOtp({ phone, code: first, termsAccepted: true }))).toBe(
          IdentityErrors.otpInvalid,
        );
      const result = await otp.verifyOtp({ phone, code: second, termsAccepted: true });
      expect(result.isNewUser).toBe(true);
    });

    it('refuses a suspended user', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      await otp.requestOtp({ phone });
      const { user } = await otp.verifyOtp({
        phone,
        code: sms.lastCodeFor(phone),
        termsAccepted: true,
      });
      await db.getRepository(User).update(user.id, { status: 'suspended' });

      await otp.requestOtp({ phone });
      const error = await errorOf(otp.verifyOtp({ phone, code: sms.lastCodeFor(phone) }));
      expect(error.status).toBe(403);
      expect(error.code).toBe(IdentityErrors.userSuspended);
    });

    it('rejects a code that is not six digits without touching the attempt count', async () => {
      const otp = serviceWith();
      const phone = nextPhone();
      await otp.requestOtp({ phone });
      expect(await errorCode(otp.verifyOtp({ phone, code: '12ab' }))).toBe(
        IdentityErrors.otpInvalid,
      );
      const challenge = await db.getRepository(OtpChallenge).findOneByOrFail({ target: phone });
      expect(challenge.attempts).toBe(0);
    });
  });
});
