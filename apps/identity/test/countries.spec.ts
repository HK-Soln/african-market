import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { IdentityErrors } from '@am/contracts';
import { OutboxService } from '@am/database';
import { CountriesService } from '../src/countries/countries.service';
import { Country, User } from '../src/entities';
import { OtpChallenges } from '../src/otp/otp-challenges';
import { OtpRateLimiter } from '../src/otp/otp-rate-limiter';
import { OtpTestNumbers } from '../src/otp/otp-test-numbers';
import { OtpService } from '../src/otp/otp.service';
import { SessionService } from '../src/sessions/session.service';
import { SmsProvider } from '../src/sms/sms-provider';
import { createTestDatabase, TestDatabase } from './support/test-database';

const key = `${randomUUID()}${randomUUID()}`;

async function errorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return (err as { getError: () => { code: string; details?: unknown } }).getError();
  }
  throw new Error('Expected the call to fail');
}

describe('countries (Postgres)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let redis: Redis;
  let countries: CountriesService;
  const prefix = `test:countries:${randomUUID()}`;
  const silent: SmsProvider = { send: async () => undefined };

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
        `${prefix}:${randomUUID()}`,
      ),
      silent,
      new OutboxService('identity'),
      new OtpChallenges(key),
      new SessionService(db, key),
      OtpTestNumbers.none(),
      countries,
    );

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    countries = new CountriesService(db);
  }, 60_000);

  afterAll(async () => {
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length) await redis.del(...keys);
    await redis.quit();
    await testDb?.drop();
  });

  it('is seeded with every country, names in three languages, the nine offered so far first', async () => {
    const { countries: all } = await countries.listAll();
    expect(all.length).toBeGreaterThan(240);
    expect(all.slice(0, 9).map((c) => c.code)).toEqual([
      'AE',
      'NG',
      'GH',
      'KE',
      'ET',
      'CM',
      'SN',
      'UG',
      'ZA',
    ]);
    expect(all[0]).toEqual({
      code: 'AE',
      name: {
        en: 'United Arab Emirates',
        ar: 'الإمارات العربية المتحدة',
        fr: 'Émirats arabes unis',
      },
      dialCode: '+971',
      flag: '🇦🇪',
      phoneEnabled: true,
      originEnabled: true,
      sortOrder: 1,
    });
    expect(all.find((c) => c.code === 'FR')).toMatchObject({
      phoneEnabled: false,
      dialCode: '+33',
    });
  });

  it('lists only what is enabled for the pickers', async () => {
    const { countries: listed } = await countries.list();
    expect(listed.map((c) => c.code)).toEqual([
      'AE',
      'NG',
      'GH',
      'KE',
      'ET',
      'CM',
      'SN',
      'UG',
      'ZA',
    ]);
  });

  it('lets an admin rename, reorder and switch a country', async () => {
    const updated = await countries.update({
      code: 'fr',
      name: { en: 'France (test)' },
      phoneEnabled: true,
      sortOrder: 5,
    });
    expect(updated).toMatchObject({
      code: 'FR',
      name: { en: 'France (test)', fr: 'France' },
      phoneEnabled: true,
      originEnabled: false,
      sortOrder: 5,
    });
    const listed = (await countries.list()).countries.map((c) => c.code);
    // Sort order 5 ties with Ethiopia; ties go by English name.
    expect(listed.indexOf('FR')).toBeGreaterThan(listed.indexOf('KE'));
    expect(listed).toContain('FR');

    await countries.update({
      code: 'FR',
      name: { en: 'France' },
      phoneEnabled: false,
      sortOrder: 1000,
    });
  });

  it('says which country is missing', async () => {
    expect((await errorOf(countries.update({ code: 'QQ', phoneEnabled: true }))).code).toBe(
      IdentityErrors.countryNotFound,
    );
  });

  it('refuses a new sign-up from a country that is not enabled, and names the country', async () => {
    const error = await errorOf(otp().requestOtp({ phone: '+33612345678', locale: 'en' }));
    expect(error).toMatchObject({
      code: IdentityErrors.phoneCountryNotSupported,
      details: { country: 'FR' },
    });
  });

  it('still sends a code to an existing account after its country is switched off', async () => {
    await db.getRepository(User).save(db.getRepository(User).create({ phone: '+33612345679' }));
    await expect(otp().requestOtp({ phone: '+33612345679', locale: 'en' })).resolves.toMatchObject({
      phone: '+33612345679',
    });
  });

  it('sends a code for an enabled country', async () => {
    await expect(
      otp().requestOtp({ phone: '+2348031234567', locale: 'en' }),
    ).resolves.toMatchObject({ phone: '+2348031234567' });
  });

  it('keeps the code and dial code well-formed in the database', async () => {
    const repo = db.getRepository(Country);
    await expect(
      repo.insert({ code: 'aa', name: { en: 'x' }, dialCode: '+1', flag: 'x' }),
    ).rejects.toThrow(/country_code_chk/);
    await expect(
      repo.insert({ code: 'AA', name: { en: 'x' }, dialCode: '971', flag: 'x' }),
    ).rejects.toThrow(/country_dial_code_chk/);
  });
});
