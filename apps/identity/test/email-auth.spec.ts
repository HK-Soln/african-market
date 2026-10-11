import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { IdentityErrors } from '@am/contracts';
import { OutboxMessage, OutboxService } from '@am/database';
import { EmailAuthService, normalizeEmail } from '../src/email-auth/email-auth.service';
import { EmailMessage, EmailProvider, SmtpEmailProvider } from '../src/email/email-provider';
import { verificationEmail } from '../src/email/email-templates';
import { Credential, OtpChallenge, Session, User } from '../src/entities';
import { OtpChallenges } from '../src/otp/otp-challenges';
import { OtpRateLimiter } from '../src/otp/otp-rate-limiter';
import { LoginRateLimiter, LoginRateLimits } from '../src/password/login-rate-limiter';
import { SessionService } from '../src/sessions/session.service';
import { createTestDatabase, TestDatabase } from './support/test-database';

/** Captures emails instead of sending them, and can be told to fail. */
class FakeEmailProvider implements EmailProvider {
  readonly sent: EmailMessage[] = [];
  failNext = false;

  async send(message: EmailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('mail server unavailable');
    }
    this.sent.push(message);
  }

  lastTo(email: string): EmailMessage {
    const message = [...this.sent].reverse().find((m) => m.to === email);
    if (!message) throw new Error(`No email was sent to ${email}`);
    return message;
  }

  /** The code inside the most recent email to this address. */
  lastCodeFor(email: string): string {
    const code = this.lastTo(email).text.match(/\d{6}/)?.[0];
    if (!code) throw new Error(`The last email to ${email} carries no code`);
    return code;
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

const codeOf = async (promise: Promise<unknown>) => (await errorOf(promise)).code;

// Generated, so no password-shaped literal sits in the repository.
const password = `pw-${randomUUID()}`;
const otherPassword = `pw-${randomUUID()}`;

let emailSeq = 0;
const nextEmail = () => `person${++emailSeq}-${randomUUID().slice(0, 8)}@example.com`;

describe('email and password (Postgres + Redis)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let redis: Redis;
  let mail: FakeEmailProvider;
  const runPrefix = `test:email:${randomUUID()}`;

  const serviceWith = (login: Partial<LoginRateLimits> = {}) => {
    const prefix = `${runPrefix}:${randomUUID()}`;
    return new EmailAuthService(
      db,
      new OtpRateLimiter(
        redis,
        {
          cooldownSeconds: 0,
          maxCooldownSeconds: 900,
          maxPerPhonePerHour: 100,
          maxPerIpPerHour: 100,
        },
        `${prefix}:code`,
      ),
      new LoginRateLimiter(
        redis,
        { maxFailuresPerEmail: 5, maxFailuresPerIp: 100, windowSeconds: 900, ...login },
        `${prefix}:login`,
      ),
      mail,
      new OutboxService('identity'),
      new OtpChallenges(`${randomUUID()}${randomUUID()}`),
      new SessionService(db, `${randomUUID()}${randomUUID()}`),
    );
  };

  /** Registers and verifies an account, returning its email. */
  const verifiedAccount = async (auth: EmailAuthService, secret = password) => {
    const email = nextEmail();
    await auth.register({ email, password: secret, termsAccepted: true });
    await auth.verifyEmail({ email, code: mail.lastCodeFor(email), password: secret });
    return email;
  };

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
    mail = new FakeEmailProvider();
  });

  afterAll(async () => {
    const keys = await redis.keys(`${runPrefix}:*`);
    if (keys.length) await redis.del(...keys);
    await redis.quit();
    await testDb?.drop();
  });

  describe('normalizeEmail', () => {
    it('trims and lower-cases, and rejects what is not an address', () => {
      expect(normalizeEmail('  Amina@Example.COM ')).toBe('amina@example.com');
      expect(normalizeEmail('amina')).toBeNull();
      expect(normalizeEmail('amina@example')).toBeNull();
      expect(normalizeEmail('a b@example.com')).toBeNull();
    });
  });

  describe('registering', () => {
    it('creates an unverified account, stores an argon2id hash and emails a code', async () => {
      const auth = serviceWith();
      const email = nextEmail();
      const result = await auth.register({
        email: email.toUpperCase(),
        password,
        name: '  Adaeze Okafor ',
        preferredLanguage: 'fr',
        termsAccepted: true,
        marketingConsent: true,
      });
      expect(result.email).toBe(email);

      const user = await db.getRepository(User).findOneByOrFail({ email });
      expect(user).toMatchObject({ name: 'Adaeze Okafor', preferredLanguage: 'fr' });
      expect(user.emailVerifiedAt).toBeNull();
      expect(user.termsAcceptedAt).toBeInstanceOf(Date);
      expect(user.marketingConsentAt).toBeInstanceOf(Date);

      const credential = await db
        .getRepository(Credential)
        .findOneByOrFail({ userId: user.id, type: 'password' });
      expect(credential.secretHash).toMatch(/^\$argon2id\$/);
      expect(credential.secretHash).not.toContain(password);

      const sent = mail.lastTo(email);
      expect(sent.subject).toBe('Votre code African Market');
      expect(sent.text).toMatch(/\d{6}/);
      expect(await registeredEvents(user.id)).toHaveLength(0);
    });

    it('rejects a bad email, a short or huge password, and missing consent', async () => {
      const auth = serviceWith();
      const email = nextEmail();
      expect(await codeOf(auth.register({ email: 'nope', password, termsAccepted: true }))).toBe(
        IdentityErrors.emailInvalid,
      );
      expect(
        await codeOf(auth.register({ email, password: 'too-short', termsAccepted: true })),
      ).toBe(IdentityErrors.passwordTooShort);
      expect(
        await codeOf(auth.register({ email, password: 'x'.repeat(129), termsAccepted: true })),
      ).toBe(IdentityErrors.passwordTooLong);
      expect(await codeOf(auth.register({ email, password, termsAccepted: false }))).toBe(
        IdentityErrors.termsNotAccepted,
      );
      expect(await db.getRepository(User).countBy({ email })).toBe(0);
      expect(mail.sent).toHaveLength(0);
    });

    it('answers the same for a registered address, and tells its owner instead', async () => {
      const auth = serviceWith();
      const email = await verifiedAccount(auth);
      const before = await db.getRepository(Credential).findOneByOrFail({ type: 'password' });
      mail.sent.length = 0;

      const result = await auth.register({ email, password: otherPassword, termsAccepted: true });
      expect(Object.keys(result).sort()).toEqual(['email', 'expiresAt', 'resendAfterSeconds']);
      expect(mail.sent).toHaveLength(1);
      expect(mail.lastTo(email).subject).toBe('You already have an African Market account');
      expect(mail.lastTo(email).text).not.toMatch(/\d{6}/);

      // The existing password still works and the new one does not.
      await auth.login({ email, password });
      expect(await codeOf(auth.login({ email, password: otherPassword }))).toBe(
        IdentityErrors.invalidCredentials,
      );
      expect(before.secretHash).toBeTruthy();
    });

    it('leaves no usable code behind when the email cannot be sent', async () => {
      const auth = serviceWith();
      const email = nextEmail();
      mail.failNext = true;
      const error = await errorOf(auth.register({ email, password, termsAccepted: true }));
      expect(error.status).toBe(502);
      expect(error.code).toBe(IdentityErrors.emailSendFailed);
      expect(await db.getRepository(OtpChallenge).countBy({ target: email })).toBe(0);
    });
  });

  describe('verifying the address', () => {
    it('verifies with the code and password, and queues user.registered once', async () => {
      const auth = serviceWith();
      const email = nextEmail();
      await auth.register({ email, password, termsAccepted: true, preferredLanguage: 'ar' });

      const result = await auth.verifyEmail({
        email,
        code: mail.lastCodeFor(email),
        password,
        correlationId: 'req-9',
      });
      expect(result.isNewUser).toBe(true);
      expect(result.user).toMatchObject({ email, emailVerified: true, phoneVerified: false });

      const events = await registeredEvents(result.user.id);
      expect(events).toHaveLength(1);
      expect(events[0].envelope).toMatchObject({
        name: 'user.registered',
        correlationId: 'req-9',
        payload: { userId: result.user.id, email, preferredLanguage: 'ar' },
      });
    });

    it('rejects a wrong code and counts the attempt', async () => {
      const auth = serviceWith();
      const email = nextEmail();
      await auth.register({ email, password, termsAccepted: true });
      const right = mail.lastCodeFor(email);
      const wrong = right === '000000' ? '000001' : '000000';
      const error = await errorOf(auth.verifyEmail({ email, code: wrong, password }));
      expect(error.code).toBe(IdentityErrors.otpInvalid);
      expect(error.details).toEqual({ attemptsLeft: 4 });
    });

    it('does not let someone who re-registered a pending address get their password confirmed', async () => {
      const auth = serviceWith();
      const email = nextEmail();
      // The real owner registers; before they confirm, someone else registers the same address.
      await auth.register({ email, password, termsAccepted: true });
      await auth.register({ email, password: otherPassword, termsAccepted: true });
      const latestCode = mail.lastCodeFor(email);

      // The owner reads the newest code from their inbox and enters it with their own password.
      expect(await codeOf(auth.verifyEmail({ email, code: latestCode, password }))).toBe(
        IdentityErrors.invalidCredentials,
      );
      const user = await db.getRepository(User).findOneByOrFail({ email });
      expect(user.emailVerifiedAt).toBeNull();

      // They register again, which puts their password back, and then verify.
      await auth.register({ email, password, termsAccepted: true });
      await auth.verifyEmail({ email, code: mail.lastCodeFor(email), password });
      await auth.login({ email, password });
      expect(await codeOf(auth.login({ email, password: otherPassword }))).toBe(
        IdentityErrors.invalidCredentials,
      );
    });

    it('resends a code only to an address that is waiting for one', async () => {
      const auth = serviceWith();
      const pending = nextEmail();
      await auth.register({ email: pending, password, termsAccepted: true });
      const first = mail.lastCodeFor(pending);
      await auth.resendCode({ email: pending, locale: 'ar' });
      expect(mail.sent).toHaveLength(2);
      expect(mail.lastTo(pending).subject).toContain('السوق الأفريقي');
      // The earlier code no longer works.
      if (first !== mail.lastCodeFor(pending))
        expect(await codeOf(auth.verifyEmail({ email: pending, code: first, password }))).toBe(
          IdentityErrors.otpInvalid,
        );

      const verified = await verifiedAccount(auth);
      mail.sent.length = 0;
      await auth.resendCode({ email: verified });
      await auth.resendCode({ email: nextEmail() });
      expect(mail.sent).toHaveLength(0);
    });
  });

  describe('signing in', () => {
    it('signs in with the right password, whatever the case of the email', async () => {
      const auth = serviceWith();
      const email = await verifiedAccount(auth);
      const result = await auth.login({ email: email.toUpperCase(), password });
      expect(result.user.email).toBe(email);
    });

    it('gives the same answer for a wrong password and an unknown email', async () => {
      const auth = serviceWith();
      const email = await verifiedAccount(auth);
      const wrongPassword = await errorOf(auth.login({ email, password: otherPassword }));
      const unknownEmail = await errorOf(auth.login({ email: nextEmail(), password }));
      expect(wrongPassword).toEqual(unknownEmail);
      expect(wrongPassword.status).toBe(401);
      expect(wrongPassword.code).toBe(IdentityErrors.invalidCredentials);
    });

    it('says the address is unverified only after the right password', async () => {
      const auth = serviceWith();
      const email = nextEmail();
      await auth.register({ email, password, termsAccepted: true });
      expect(await codeOf(auth.login({ email, password: otherPassword }))).toBe(
        IdentityErrors.invalidCredentials,
      );
      const error = await errorOf(auth.login({ email, password }));
      expect(error.status).toBe(403);
      expect(error.code).toBe(IdentityErrors.emailNotVerified);
    });

    it('locks an email after five wrong passwords, even for the right one', async () => {
      const auth = serviceWith({ maxFailuresPerEmail: 5 });
      const email = await verifiedAccount(auth);
      for (let i = 0; i < 5; i++)
        expect(await codeOf(auth.login({ email, password: otherPassword }))).toBe(
          IdentityErrors.invalidCredentials,
        );
      const error = await errorOf(auth.login({ email, password }));
      expect(error.status).toBe(429);
      expect(error.code).toBe(IdentityErrors.loginRateLimited);
      expect((error.details as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
    });

    it('clears the failure count after a correct sign-in', async () => {
      const auth = serviceWith({ maxFailuresPerEmail: 3 });
      const email = await verifiedAccount(auth);
      for (let round = 0; round < 3; round++) {
        await codeOf(auth.login({ email, password: otherPassword }));
        await codeOf(auth.login({ email, password: otherPassword }));
        await auth.login({ email, password });
      }
    });

    it('limits wrong passwords from one network across different emails', async () => {
      const auth = serviceWith({ maxFailuresPerIp: 3 });
      const ip = '203.0.113.20';
      for (let i = 0; i < 3; i++) await codeOf(auth.login({ email: nextEmail(), password, ip }));
      expect(await codeOf(auth.login({ email: nextEmail(), password, ip }))).toBe(
        IdentityErrors.loginRateLimited,
      );
    });

    it('refuses a suspended user', async () => {
      const auth = serviceWith();
      const email = await verifiedAccount(auth);
      await db.getRepository(User).update({ email }, { status: 'suspended' });
      expect(await codeOf(auth.login({ email, password }))).toBe(IdentityErrors.userSuspended);
    });
  });

  describe('resetting a password', () => {
    it('sets a new password with the emailed code and signs existing sessions out', async () => {
      const auth = serviceWith();
      const email = await verifiedAccount(auth);
      const user = await db.getRepository(User).findOneByOrFail({ email });
      // Verifying the address signed in once; this is a second device.
      await auth.login({ email, password });
      const before = await db.getRepository(Session).findBy({ userId: user.id });
      expect(before).toHaveLength(2);

      await auth.requestPasswordReset({ email });
      expect(mail.lastTo(email).subject).toBe('Reset your African Market password');
      const result = await auth.resetPassword({
        email,
        code: mail.lastCodeFor(email),
        newPassword: otherPassword,
      });
      expect(result.user.email).toBe(email);

      // Every earlier session is signed out; the one the reset started is the only live one.
      const after = await db.getRepository(Session).findBy({ userId: user.id });
      const oldIds = before.map((s) => s.id);
      expect(after.filter((s) => oldIds.includes(s.id)).every((s) => s.revokedAt)).toBe(true);
      const live = after.filter((s) => !s.revokedAt);
      expect(live).toHaveLength(1);
      expect(oldIds).not.toContain(live[0].id);
      expect(result.session.refreshToken).toEqual(expect.any(String));

      await auth.login({ email, password: otherPassword });
      expect(await codeOf(auth.login({ email, password }))).toBe(IdentityErrors.invalidCredentials);
    });

    it('answers the same for an unknown address and sends nothing', async () => {
      const auth = serviceWith();
      const known = await verifiedAccount(auth);
      mail.sent.length = 0;
      const forKnown = await auth.requestPasswordReset({ email: known });
      const forUnknown = await auth.requestPasswordReset({ email: nextEmail() });
      expect(Object.keys(forUnknown).sort()).toEqual(Object.keys(forKnown).sort());
      expect(mail.sent).toHaveLength(1);
    });

    it('does not accept a verification code as a reset code, or the other way round', async () => {
      const auth = serviceWith();
      const email = nextEmail();
      await auth.register({ email, password, termsAccepted: true });
      const signupCode = mail.lastCodeFor(email);
      expect(
        await codeOf(auth.resetPassword({ email, code: signupCode, newPassword: otherPassword })),
      ).toBe(IdentityErrors.otpExpired);

      const verified = await verifiedAccount(auth);
      await auth.requestPasswordReset({ email: verified });
      expect(
        await codeOf(
          auth.verifyEmail({ email: verified, code: mail.lastCodeFor(verified), password }),
        ),
      ).toBe(IdentityErrors.otpExpired);
    });

    it('accepts a reset code once and rejects a weak new password', async () => {
      const auth = serviceWith();
      const email = await verifiedAccount(auth);
      await auth.requestPasswordReset({ email });
      const code = mail.lastCodeFor(email);
      expect(await codeOf(auth.resetPassword({ email, code, newPassword: 'short' }))).toBe(
        IdentityErrors.passwordTooShort,
      );
      await auth.resetPassword({ email, code, newPassword: otherPassword });
      expect(await codeOf(auth.resetPassword({ email, code, newPassword: password }))).toBe(
        IdentityErrors.otpExpired,
      );
    });
  });

  describe('email content', () => {
    it('is right-to-left in Arabic and keeps the code left-to-right', () => {
      const message = verificationEmail('a@example.com', '004821', 'ar');
      expect(message.html).toContain('<html lang="ar" dir="rtl">');
      expect(message.html).toContain('<p dir="ltr"');
      expect(message.text).toContain('⁦004821⁩');
    });

    it('falls back to English for an unknown language', () => {
      expect(verificationEmail('a@example.com', '004821', 'de').subject).toBe(
        'Your African Market code',
      );
    });
  });

  // Mailpit runs in docker compose locally and as a service container in CI.
  describe('SmtpEmailProvider (Mailpit)', () => {
    const smtpUrl = process.env.SMTP_URL ?? 'smtp://localhost:1025';
    const mailpitUrl = process.env.MAILPIT_URL ?? 'http://localhost:8025';

    it('delivers a message that Mailpit receives', async () => {
      const provider = new SmtpEmailProvider(
        smtpUrl,
        'African Market <no-reply@africanmarket.local>',
      );
      const to = nextEmail();
      try {
        await provider.send(verificationEmail(to, '482199', 'en'));
      } finally {
        provider.close();
      }

      // Mailpit indexes a message a moment after accepting it, so ask until it shows up.
      type Found = { messages: Array<{ Subject: string; From: { Address: string } }> };
      let body: Found = { messages: [] };
      for (let attempt = 0; attempt < 40 && body.messages.length === 0; attempt++) {
        const search = await fetch(
          `${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
        );
        body = (await search.json()) as Found;
        if (body.messages.length === 0) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0].Subject).toBe('Your African Market code');
      expect(body.messages[0].From.Address).toBe('no-reply@africanmarket.local');
    });
  });
});
