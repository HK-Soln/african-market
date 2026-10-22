import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { AddressInfo, createServer } from 'node:net';
import type { INestMicroservice } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { IdentityErrors, IdentityPatterns } from '@am/contracts';
import { FAKE_OTP_CODE, FakeIdentityController, startFakeIdentity } from './support/fake-identity';

/** A port nothing is listening on, for the stand-in identity service. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });

const cookiesOf = (res: request.Response): string[] => {
  const header = res.headers['set-cookie'] as unknown;
  return Array.isArray(header) ? (header as string[]) : header ? [String(header)] : [];
};
const cookieNamed = (res: request.Response, name: string) =>
  cookiesOf(res).find((cookie) => cookie.startsWith(`${name}=`));

let phoneSeq = 0;
const nextPhone = () => `+97150${String(2000000 + ++phoneSeq)}`;

describe('gateway auth routes (HTTP -> gateway -> TCP -> identity stand-in)', () => {
  let app: NestExpressApplication;
  let identity: INestMicroservice;
  /** Generated per run; shared by the gateway and the stand-in, as in a real deployment. */
  const accessKey = `${randomUUID()}${randomUUID()}`;

  const http = () => request(app.getHttpServer());
  const agent = () => request.agent(app.getHttpServer());

  /** Signs a new person in through the two OTP routes and returns the agent holding the cookies. */
  const signIn = async () => {
    const browser = agent();
    const phone = nextPhone();
    const verified = await browser
      .post('/api/v1/auth/otp/verify')
      .send({ phone, code: FAKE_OTP_CODE, termsAccepted: true })
      .expect(200);
    return { browser, phone, verified };
  };

  beforeAll(async () => {
    const port = await freePort();
    // The gateway reads these when its modules are first loaded, hence the late require below.
    process.env.IDENTITY_TCP_PORT = String(port);
    process.env.IDENTITY_HOST = '127.0.0.1';
    process.env.JWT_ACCESS_SECRET = accessKey;
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'fatal';
    identity = await startFakeIdentity(port, accessKey);

    const { AppModule } = (await import('../src/app.module')) as typeof import('../src/app.module');
    const { configureApp } = (await import('../src/setup')) as typeof import('../src/setup');
    app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
    configureApp(app, { corsOrigins: ['http://localhost:3000'] });
    await app.init();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await identity?.close();
  });

  describe('the phone code flow', () => {
    it('signs up, reads and edits the profile, refreshes and signs out', async () => {
      const browser = agent();
      const phone = nextPhone();

      const requested = await browser
        .post('/api/v1/auth/otp/request')
        .set('Accept-Language', 'ar-AE,ar;q=0.9,en;q=0.8')
        .send({ phone })
        .expect(200);
      expect(requested.body).toMatchObject({ phone, channel: 'whatsapp', resendAfterSeconds: 30 });
      // The gateway adds what identity needs for its limits and for the message language.
      const forwarded = FakeIdentityController.last(IdentityPatterns.requestOtp);
      expect(forwarded.locale).toBe('ar');
      expect(typeof forwarded.ip).toBe('string');

      const verified = await browser
        .post('/api/v1/auth/otp/verify')
        .set('User-Agent', 'gateway-test')
        .send({ phone, code: FAKE_OTP_CODE, termsAccepted: true })
        .expect(200);
      expect(verified.body.isNewUser).toBe(true);
      expect(verified.body.user.phone).toBe(phone);
      expect(typeof verified.body.accessToken).toBe('string');
      // The refresh token only ever travels in its cookie.
      expect(JSON.stringify(verified.body)).not.toContain('refreshToken');
      expect(FakeIdentityController.last(IdentityPatterns.verifyOtp).userAgent).toBe(
        'gateway-test',
      );

      const access = cookieNamed(verified, 'am_at') ?? '';
      const refresh = cookieNamed(verified, 'am_rt') ?? '';
      expect(access).toMatch(/; Path=\/;/);
      expect(access).toMatch(/HttpOnly/);
      expect(access).toMatch(/SameSite=Lax/);
      expect(refresh).toMatch(/; Path=\/api\/v1\/auth;/);
      expect(refresh).toMatch(/HttpOnly/);
      expect(refresh).toMatch(/SameSite=Lax/);
      // Secure is added in staging and production only; plain http is used locally.
      expect(access).not.toMatch(/Secure/);

      const me = await browser.get('/api/v1/me').expect(200);
      expect(me.body.user.id).toBe(verified.body.user.id);
      expect(me.body.shops).toEqual([]);

      const patched = await browser
        .patch('/api/v1/me')
        .send({ name: 'Amina Diallo', homeEmirate: 'SHJ' })
        .expect(200);
      expect(patched.body.user).toMatchObject({ name: 'Amina Diallo', homeEmirate: 'SHJ' });
      // The user id comes from the token, never from the body.
      expect(FakeIdentityController.last(IdentityPatterns.updateMe).userId).toBe(
        verified.body.user.id,
      );

      const refreshed = await browser.post('/api/v1/auth/refresh').expect(200);
      expect(refreshed.body.user.id).toBe(verified.body.user.id);
      expect(cookieNamed(refreshed, 'am_rt')).toBeDefined();
      expect(cookieNamed(refreshed, 'am_rt')).not.toBe(refresh);
      await browser.get('/api/v1/me').expect(200);

      const out = await browser.post('/api/v1/auth/logout').expect(200);
      expect(out.body).toEqual({ loggedOut: true });
      expect(cookieNamed(out, 'am_at')).toMatch(/^am_at=;/);
      expect(cookieNamed(out, 'am_rt')).toMatch(/^am_rt=;/);

      const after = await browser.get('/api/v1/me').expect(401);
      expect(after.body).toMatchObject({ statusCode: 401, code: 'AUTH_REQUIRED' });
      const dead = await browser.post('/api/v1/auth/refresh').expect(401);
      expect(dead.body.code).toBe('SESSION_INVALID');
    });

    it('signs in with a social provider, setting the session cookies', async () => {
      const providers = await http().get('/api/v1/auth/social/providers').expect(200);
      expect(providers.body).toEqual({
        google: { clientId: 'web-client.apps.googleusercontent.com' },
        facebook: null,
      });

      const res = await http()
        .post('/api/v1/auth/social')
        .set('Accept-Language', 'ar')
        .send({ provider: 'google', token: 'good:ada-0001', termsAccepted: true })
        .expect(200);
      expect(res.body).toMatchObject({ isNewUser: true, user: { email: 'ada-0001@example.com' } });
      expect(String(res.headers['set-cookie'])).toContain('am_at=');
      expect(FakeIdentityController.last(IdentityPatterns.socialSignIn)).toMatchObject({
        provider: 'google',
        preferredLanguage: 'ar',
      });

      const refused = await http()
        .post('/api/v1/auth/social')
        .send({ provider: 'google', token: 'forged-token-value', termsAccepted: true })
        .expect(401);
      expect(refused.body.code).toBe(IdentityErrors.socialTokenInvalid);
      await http()
        .post('/api/v1/auth/social')
        .send({ provider: 'apple', token: 'good:x-0000000' })
        .expect(400);
    });

    it('signs an existing person in without asking for the terms again', async () => {
      const { phone } = await signIn();
      const again = await http()
        .post('/api/v1/auth/otp/verify')
        .send({ phone, code: FAKE_OTP_CODE })
        .expect(200);
      expect(again.body.isNewUser).toBe(false);
    });

    it('passes an identity error through with its status, code and details', async () => {
      const wrong = await http()
        .post('/api/v1/auth/otp/verify')
        .send({ phone: nextPhone(), code: '000000', termsAccepted: true })
        .expect(400);
      expect(wrong.body).toEqual({
        statusCode: 400,
        code: 'OTP_INVALID',
        message: expect.any(String),
        details: { attemptsLeft: 4 },
      });
      expect(cookiesOf(wrong)).toEqual([]);

      const badPhone = await http()
        .post('/api/v1/auth/otp/request')
        .send({ phone: 'not-a-phone' })
        .expect(400);
      expect(badPhone.body.code).toBe('PHONE_INVALID');
    });
  });

  describe('validation', () => {
    it('refuses a body with missing or unknown fields before calling identity', async () => {
      const before = FakeIdentityController.received.length;

      const missing = await http().post('/api/v1/auth/otp/verify').send({ code: '1' }).expect(400);
      expect(missing.body.code).toBe('VALIDATION_FAILED');
      expect(missing.body.details.issues.map((issue: { path: string }) => issue.path)).toContain(
        'phone',
      );

      const extra = await http()
        .post('/api/v1/auth/otp/request')
        .send({ phone: nextPhone(), ip: '10.0.0.1' })
        .expect(400);
      expect(extra.body.code).toBe('VALIDATION_FAILED');

      expect(FakeIdentityController.received).toHaveLength(before);
    });

    it('lets a profile field be cleared with null and passes identity’s refusal through', async () => {
      const { browser } = await signIn();
      await browser.patch('/api/v1/me').send({ name: null, homeEmirate: null }).expect(200);
      const refused = await browser.patch('/api/v1/me').send({ homeEmirate: 'XXX' }).expect(400);
      expect(refused.body.code).toBe('IDENTITY_VALIDATION_FAILED');
    });
  });

  describe('who is let in', () => {
    it('accepts the access token as a Bearer header, for clients without cookies', async () => {
      const { verified } = await signIn();
      const me = await http()
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${verified.body.accessToken}`)
        .expect(200);
      expect(me.body.user.id).toBe(verified.body.user.id);
    });

    it('refuses no token, a forged token and a token signed with another algorithm', async () => {
      expect((await http().get('/api/v1/me').expect(401)).body.code).toBe('AUTH_REQUIRED');

      const claims = { sub: randomUUID(), roles: ['admin'], shops: [] };
      const forged = await new JwtService({ secret: `${randomUUID()}${randomUUID()}` }).signAsync(
        claims,
      );
      const otherAlgorithm = await new JwtService({ secret: accessKey }).signAsync(claims, {
        algorithm: 'HS512',
      });
      for (const token of [forged, otherAlgorithm]) {
        const res = await http()
          .get('/api/v1/me')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
        expect(res.body.code).toBe('AUTH_INVALID_TOKEN');
      }
    });

    it('clears the cookies when identity refuses the refresh token', async () => {
      const refused = await http()
        .post('/api/v1/auth/refresh')
        .set('Cookie', 'am_rt=never-issued')
        .expect(401);
      expect(refused.body.code).toBe('SESSION_INVALID');
      expect(cookieNamed(refused, 'am_rt')).toMatch(/^am_rt=;/);
      expect(cookieNamed(refused, 'am_at')).toMatch(/^am_at=;/);
    });
  });

  describe('countries', () => {
    /** An access token with the given roles, signed like identity signs them. */
    const tokenWith = (roles: string[]) =>
      new JwtService({ secret: accessKey }).signAsync(
        { sub: randomUUID(), roles, shops: [], locale: 'en' },
        { expiresIn: 300 },
      );

    it('lists the enabled countries for anyone, and lets caches keep them for five minutes', async () => {
      const res = await agent().get('/api/v1/countries').expect(200);
      expect(res.body.items.map((c: { code: string }) => c.code)).toEqual(['AE']);
      expect(res.body).toMatchObject({ nextCursor: null, prevCursor: null });
      expect(res.headers['cache-control']).toBe('public, max-age=300');
    });

    it('keeps the admin list and edits to admins', async () => {
      await agent().get('/api/v1/admin/countries').expect(401);
      const customer = await tokenWith(['customer']);
      await agent()
        .get('/api/v1/admin/countries')
        .set('Authorization', `Bearer ${customer}`)
        .expect(403);
      await agent()
        .patch('/api/v1/admin/countries/FR')
        .set('Authorization', `Bearer ${customer}`)
        .send({ phoneEnabled: true })
        .expect(403);

      const admin = await tokenWith(['customer', 'admin']);
      const all = await agent()
        .get('/api/v1/admin/countries')
        .set('Authorization', `Bearer ${admin}`)
        .expect(200);
      expect(all.body.items).toHaveLength(2);
      expect(all.headers['cache-control']).toBe('no-store');

      const updated = await agent()
        .patch('/api/v1/admin/countries/fr')
        .set('Authorization', `Bearer ${admin}`)
        .send({ phoneEnabled: true, name: { en: 'France' } })
        .expect(200);
      expect(updated.body).toMatchObject({ code: 'FR', phoneEnabled: true });
      // With the admin and the request id, for the audit log.
      expect(FakeIdentityController.last(IdentityPatterns.updateCountry)).toEqual({
        code: 'fr',
        phoneEnabled: true,
        name: { en: 'France' },
        actor: expect.objectContaining({ roles: ['customer', 'admin'] }),
        correlationId: expect.any(String),
      });
    });

    it('refuses an edit with unknown or malformed fields before calling identity', async () => {
      const admin = await tokenWith(['admin']);
      const res = await agent()
        .patch('/api/v1/admin/countries/AE')
        .set('Authorization', `Bearer ${admin}`)
        .send({ sortOrder: -1, dialCode: '+1' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('reads the standard list format and hands identity a checked query', async () => {
      await agent()
        .get(
          '/api/v1/countries?filter[phoneEnabled]=true&filter[search][like]=nig&sort=-name,code&limit=5',
        )
        .expect(200);
      expect(FakeIdentityController.last(IdentityPatterns.listCountries)).toEqual({
        query: {
          filters: [
            { field: 'phoneEnabled', op: 'eq', value: true },
            { field: 'search', op: 'like', value: 'nig' },
          ],
          sort: [
            { field: 'name', direction: 'desc' },
            { field: 'code', direction: 'asc' },
          ],
          limit: 5,
        },
      });
    });

    it.each([
      ['filter[password]=x', 'filter[password]'],
      ['sort=dialCode', 'sort'],
      ['limit=1000', 'limit'],
      ['cursor=forged', 'cursor'],
      ['page=2', 'page'],
    ])('refuses %s before calling identity', async (query, param) => {
      const res = await agent().get(`/api/v1/countries?${query}`).expect(400);
      expect(res.body).toMatchObject({ code: 'LIST_QUERY_INVALID', details: { param } });
    });

    it('passes a missing country through as 404', async () => {
      const admin = await tokenWith(['admin']);
      const res = await agent()
        .patch('/api/v1/admin/countries/QQ')
        .set('Authorization', `Bearer ${admin}`)
        .send({ phoneEnabled: true })
        .expect(404);
      expect(res.body.code).toBe('COUNTRY_NOT_FOUND');
    });
  });

  describe('test-only support', () => {
    it('serves the code route under NODE_ENV=test, which this run is', async () => {
      const res = await http().get('/api/v1/test/otp').query({ phone: '+971501234567' });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ code: FAKE_OTP_CODE });
    });

    it('loads no test-only module under any other NODE_ENV', async () => {
      const { testSupportModules } = await import('../src/test-support/test-support.module');
      for (const env of ['development', 'staging', 'production', '', undefined]) {
        expect(testSupportModules(env)).toEqual([]);
      }
      expect(testSupportModules('test')).toHaveLength(1);
    });

    it('keeps the route out of the published API description', async () => {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const spec = readFileSync(join(__dirname, '..', 'openapi.json'), 'utf8');
      expect(spec).not.toContain('/api/v1/test/');
    });
  });

  describe('your data (export and deletion)', () => {
    it('sends everything identity holds as a file nobody caches', async () => {
      const { browser } = await signIn();
      const res = await browser.get('/api/v1/me/export').expect(200);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="african-market-data-2026-10-16.json"',
      );
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({
        format: 'african-market.identity/1',
        account: { roles: ['customer'] },
      });
    });

    it('is only for the signed-in person', async () => {
      await http().get('/api/v1/me/export').expect(401);
      await http().delete('/api/v1/me').expect(401);
    });

    it('deletes the account with the sign-in time and signs this browser out', async () => {
      const { browser } = await signIn();
      const res = await browser.delete('/api/v1/me').expect(200);
      expect(res.body).toEqual({
        deletedAt: '2026-10-16T09:00:00.000Z',
        erasedAfter: '2026-11-15T09:00:00.000Z',
      });
      const sent = FakeIdentityController.last(IdentityPatterns.deleteMe);
      expect(sent).toMatchObject({ userId: expect.any(String), authTime: expect.any(Number) });
      expect(cookieNamed(res, 'am_at')).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect(cookieNamed(res, 'am_rt')).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('asks for a fresh sign-in when the last one is old', async () => {
      FakeIdentityController.signedInSecondsAgo = 3600;
      try {
        const { browser } = await signIn();
        const res = await browser.delete('/api/v1/me').expect(403);
        expect(res.body.code).toBe('AUTH_REAUTH_REQUIRED');
        expect(cookieNamed(res, 'am_at')).toBeUndefined();
      } finally {
        FakeIdentityController.signedInSecondsAgo = 0;
      }
    });
  });

  describe('request ids', () => {
    it('answers every request with the id its logs (and its trace) are filed under', async () => {
      const res = await http().get('/api/v1/countries').expect(200);
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{32,36}$/);
    });

    it('keeps an id the caller chose, and replaces one it cannot safely log', async () => {
      const kept = await http()
        .get('/api/v1/countries')
        .set('x-request-id', 'support-123')
        .expect(200);
      expect(kept.headers['x-request-id']).toBe('support-123');
      const replaced = await http()
        .get('/api/v1/countries')
        .set('x-request-id', 'a b <script>')
        .expect(200);
      expect(replaced.headers['x-request-id']).not.toBe('a b <script>');
    });
  });

  describe('errors and limits', () => {
    it('answers an unknown route in the same error shape', async () => {
      const res = await http().get('/api/v1/nope').expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });

    // Last, because it uses up this route's allowance for the test run's IP.
    it('limits how fast one address can ask for codes', async () => {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 8; attempt++) {
        const res = await http().post('/api/v1/auth/otp/request').send({ phone: nextPhone() });
        statuses.push(res.status);
        if (res.status === 429) {
          expect(res.body).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
          break;
        }
      }
      expect(statuses).toContain(429);
      expect(statuses.filter((status) => status === 200).length).toBeLessThanOrEqual(5);
      // Other routes are unaffected.
      await http().get('/api/v1/health').expect(200);
    });
  });
});
