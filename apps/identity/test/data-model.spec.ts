import { randomUUID } from 'node:crypto';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { toGeoJsonPoint, withinMeters } from '@am/geo';
import { Address, Credential, OtpChallenge, Session, ShopMember, User } from '../src/entities';
import { createTestDatabase, TestDatabase } from './support/test-database';

/** Runs the real migrations on PostGIS, then checks the constraints the rest of identity relies on. */
describe('identity data model (PostGIS)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let users: Repository<User>;

  const createUser = (fields: Partial<User> = {}) => users.save(users.create(fields));

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    users = db.getRepository(User);
  }, 60_000);

  afterAll(async () => {
    await testDb?.drop();
  });

  it('migrations leave nothing for the entities to add (no schema drift)', async () => {
    const pending = await db.driver.createSchemaBuilder().log();
    expect(pending.upQueries.map((q) => q.query)).toEqual([]);
  });

  it('gives a new user the customer role, English and active status', async () => {
    const user = await createUser({ phone: '+971501110001' });
    const saved = await users.findOneByOrFail({ id: user.id });
    expect(saved.roles).toEqual(['customer']);
    expect(saved.preferredLanguage).toBe('en');
    expect(saved.status).toBe('active');
    expect(saved.email).toBeNull();
  });

  it('rejects a second live user with the same phone', async () => {
    await createUser({ phone: '+971501110002' });
    await expect(createUser({ phone: '+971501110002' })).rejects.toThrow(QueryFailedError);
  });

  it('treats email as case-insensitive when enforcing uniqueness', async () => {
    await createUser({ email: 'Amina@Example.com' });
    await expect(createUser({ email: 'amina@example.com' })).rejects.toThrow(QueryFailedError);
  });

  it('lets a phone and email be reused after the account is soft-deleted', async () => {
    const first = await createUser({ phone: '+971501110003', email: 'reuse@example.com' });
    await users.softDelete(first.id);
    const second = await createUser({ phone: '+971501110003', email: 'reuse@example.com' });
    expect(second.id).not.toBe(first.id);
  });

  it('allows many users without a phone or an email', async () => {
    await createUser({ email: 'only-email-1@example.com' });
    await createUser({ email: 'only-email-2@example.com' });
    await createUser({ phone: '+971501110004' });
    await createUser({ phone: '+971501110005' });
  });

  it('rejects unknown roles, statuses and languages', async () => {
    await expect(createUser({ roles: ['superuser' as never] })).rejects.toThrow(QueryFailedError);
    await expect(createUser({ status: 'banned' as never })).rejects.toThrow(QueryFailedError);
    await expect(createUser({ preferredLanguage: 'de' as never })).rejects.toThrow(
      QueryFailedError,
    );
  });

  describe('credential', () => {
    const credentials = () => db.getRepository(Credential);

    it('keeps one password per user and one account per provider subject', async () => {
      const a = await createUser({ email: 'cred-a@example.com' });
      const b = await createUser({ email: 'cred-b@example.com' });
      await credentials().save({ userId: a.id, type: 'password', secretHash: 'hash-1' });
      await expect(
        credentials().save({ userId: a.id, type: 'password', secretHash: 'hash-2' }),
      ).rejects.toThrow(QueryFailedError);

      await credentials().save({ userId: a.id, type: 'google', providerSubject: 'g-123' });
      await expect(
        credentials().save({ userId: b.id, type: 'google', providerSubject: 'g-123' }),
      ).rejects.toThrow(QueryFailedError);
      // The same subject id under a different provider is a different identity.
      await credentials().save({ userId: b.id, type: 'apple', providerSubject: 'g-123' });
    });

    it('requires a hash for passwords and a subject for social sign-in', async () => {
      const user = await createUser({ email: 'cred-c@example.com' });
      await expect(credentials().save({ userId: user.id, type: 'password' })).rejects.toThrow(
        QueryFailedError,
      );
      await expect(credentials().save({ userId: user.id, type: 'google' })).rejects.toThrow(
        QueryFailedError,
      );
    });

    it('is removed with its user', async () => {
      const user = await createUser({ email: 'cred-d@example.com' });
      await credentials().save({ userId: user.id, type: 'password', secretHash: 'hash' });
      await users.delete(user.id);
      expect(await credentials().countBy({ userId: user.id })).toBe(0);
    });
  });

  it('stores an OTP challenge with zero attempts and rejects an unknown channel', async () => {
    const otps = db.getRepository(OtpChallenge);
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    const saved = await otps.save({
      target: '+971501110006',
      channel: 'sms',
      purpose: 'signup',
      codeHash: 'hash',
      expiresAt,
    });
    const found = await otps.findOneByOrFail({ id: saved.id });
    expect(found.attempts).toBe(0);
    expect(found.consumedAt).toBeNull();
    await expect(
      otps.save({
        target: '+971501110006',
        channel: 'pigeon' as never,
        purpose: 'signup',
        codeHash: 'hash',
        expiresAt,
      }),
    ).rejects.toThrow(QueryFailedError);
  });

  it('keeps refresh token hashes unique and links a rotated session to its family', async () => {
    const sessions = db.getRepository(Session);
    const user = await createUser({ email: 'session@example.com' });
    const familyId = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600_000);
    const first = await sessions.save({
      userId: user.id,
      familyId,
      refreshTokenHash: 'token-hash-1',
      ip: '203.0.113.7',
      expiresAt,
    });
    const second = await sessions.save({
      userId: user.id,
      familyId,
      refreshTokenHash: 'token-hash-2',
      expiresAt,
    });
    await sessions.update(first.id, { replacedBy: second.id, revokedAt: new Date() });
    expect(await sessions.countBy({ familyId })).toBe(2);
    await expect(
      sessions.save({ userId: user.id, familyId, refreshTokenHash: 'token-hash-2', expiresAt }),
    ).rejects.toThrow(QueryFailedError);
  });

  it('allows one live membership per user and shop, with all branches by default', async () => {
    const members = db.getRepository(ShopMember);
    const user = await createUser({ email: 'member@example.com' });
    const shopId = randomUUID();
    const saved = await members.save({ userId: user.id, shopId, role: 'owner' });
    expect((await members.findOneByOrFail({ id: saved.id })).branchIds).toEqual([]);
    await expect(members.save({ userId: user.id, shopId, role: 'staff' })).rejects.toThrow(
      QueryFailedError,
    );
    await members.softDelete(saved.id);
    await members.save({ userId: user.id, shopId, role: 'staff', branchIds: [randomUUID()] });
  });

  it('stores an address pin and finds it by distance', async () => {
    const addresses = db.getRepository(Address);
    const user = await createUser({ email: 'address@example.com' });
    const deira = { lat: 25.2711, lng: 55.3075 };
    await addresses.save({
      userId: user.id,
      label: 'Home',
      emirate: 'DXB',
      area: 'Deira',
      location: toGeoJsonPoint(deira),
    });
    await addresses.save({
      userId: user.id,
      label: 'Office',
      emirate: 'AUH',
      location: toGeoJsonPoint({ lat: 24.4539, lng: 54.3773 }),
    });

    const near = await addresses
      .createQueryBuilder('a')
      .where('a.user_id = :userId', { userId: user.id })
      .andWhere(withinMeters('a.location'), { ...deira, meters: 2000 })
      .getMany();
    expect(near.map((a) => a.label)).toEqual(['Home']);
    expect(near[0].location).toEqual(toGeoJsonPoint(deira));

    await expect(addresses.save({ userId: user.id, emirate: 'XXX' as never })).rejects.toThrow(
      QueryFailedError,
    );
  });
});
