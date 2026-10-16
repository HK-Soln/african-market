import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { COUNTRY_LIST_SPEC, IdentityErrors, parseListQuery } from '@am/contracts';
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

/** A list request in the standard format, as the gateway would pass it. */
const q = (raw: Record<string, string> = {}) => parseListQuery(raw, COUNTRY_LIST_SPEC);

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
    const all = (await countries.listAll(q({ limit: '100' }))).items;
    expect(all).toHaveLength(100); // one page; the rest follow by cursor
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

  it('pages through every country with the standard list format', async () => {
    const seen: string[] = [];
    let cursor: string | null | undefined;
    do {
      const page = await countries.listAll(q({ limit: '100', ...(cursor ? { cursor } : {}) }));
      seen.push(...page.items.map((c) => c.code));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen.length).toBeGreaterThan(240);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('filters, searches in any language and sorts', async () => {
    const enabled = await countries.listAll(q({ 'filter[enabled]': 'true', sort: '-code' }));
    expect(enabled.items.map((c) => c.code)).toEqual(
      ['AE', 'CM', 'ET', 'GH', 'KE', 'NG', 'SN', 'UG', 'ZA'].sort().reverse(),
    );
    const byArabic = await countries.listAll(q({ 'filter[search][like]': 'نيجيريا' }));
    expect(byArabic.items.map((c) => c.code)).toEqual(['NG']);
    const byCode = await countries.listAll(q({ 'filter[code][in]': 'FR,DE', sort: 'code' }));
    expect(byCode.items.map((c) => c.code)).toEqual(['DE', 'FR']);
  });

  it('lists only what is enabled for the pickers', async () => {
    const listed = (await countries.list(q())).items;
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
    const listed = (await countries.list(q())).items.map((c) => c.code);
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
