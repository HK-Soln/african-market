import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { IdentityErrors } from '@am/contracts';
import { OutboxMessage, OutboxService } from '@am/database';
import { Credential, User } from '../src/entities';
import { SessionService } from '../src/sessions/session.service';
import { FakeSocialVerifier } from '../src/social/social-verifier';
import { SocialService } from '../src/social/social.service';
import { createTestDatabase, TestDatabase } from './support/test-database';

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { getError?: () => { code: string } }).getError?.().code;
  }
}

const email = () => `ada-${randomUUID().slice(0, 8)}@example.com`;
const subject = () => randomUUID().replace(/-/g, '');

describe('social sign-in (Postgres)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let social: SocialService;

  const registered = async (userId: string) =>
    (await db.getRepository(OutboxMessage).findBy({ name: 'user.registered' })).filter(
      (row) => (row.envelope as { payload: { userId: string } }).payload.userId === userId,
    );
  const google = (sub: string, mail = '', name = 'Ada Obi') => `fake:${sub}:${mail}:${name}`;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    social = new SocialService(
      db,
      new OutboxService('identity'),
      new SessionService(db, `${randomUUID()}${randomUUID()}`),
      [new FakeSocialVerifier('google'), new FakeSocialVerifier('facebook')],
      { googleClientId: 'web-client', facebookAppId: '111' },
    );
  }, 60_000);

  afterAll(() => testDb?.drop());

  it('creates an account once the terms are accepted, then signs the same person in', async () => {
    const sub = subject();
    const mail = email();
    expect(await codeOf(social.signIn({ provider: 'google', token: google(sub, mail) }))).toBe(
      IdentityErrors.termsNotAccepted,
    );
    const first = await social.signIn({
      provider: 'google',
      token: google(sub, mail),
      termsAccepted: true,
      preferredLanguage: 'ar',
    });
    expect(first).toMatchObject({
      isNewUser: true,
      user: { email: mail, name: 'Ada Obi', preferredLanguage: 'ar' },
      session: { accessToken: expect.any(String) },
    });
    const user = await db.manager.findOneByOrFail(User, { id: first.user.id });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.termsVersion).not.toBeNull();
    expect(await registered(user.id)).toHaveLength(1);

    const again = await social.signIn({ provider: 'google', token: google(sub, mail) });
    expect(again).toMatchObject({ isNewUser: false, user: { id: user.id } });
  });

  it('links to an existing verified account by email, without registering it again', async () => {
    const mail = email();
    const existing = await db.manager.save(
      db.manager.create(User, { email: mail, emailVerifiedAt: new Date(), name: 'Ada' }),
    );
    const result = await social.signIn({ provider: 'facebook', token: google(subject(), mail) });
    expect(result).toMatchObject({ isNewUser: false, user: { id: existing.id } });
    expect(
      await db.manager.findOneBy(Credential, { userId: existing.id, type: 'facebook' }),
    ).not.toBeNull();
    expect(await registered(existing.id)).toHaveLength(0);
  });

  it('gives an unconfirmed email registration to whoever the provider confirms owns the address', async () => {
    const mail = email();
    const pending = await db.manager.save(
      db.manager.create(User, { email: mail, name: 'Squatter' }),
    );
    await db.manager.insert(Credential, {
      userId: pending.id,
      type: 'password',
      secretHash: 'argon2-hash',
      providerSubject: null,
    });

    const result = await social.signIn({
      provider: 'google',
      token: google(subject(), mail),
      termsAccepted: true,
    });
    expect(result).toMatchObject({ isNewUser: true, user: { id: pending.id } });
    expect(
      await db.manager.findOneBy(Credential, { userId: pending.id, type: 'password' }),
    ).toBeNull();
    expect(
      (await db.manager.findOneByOrFail(User, { id: pending.id })).emailVerifiedAt,
    ).not.toBeNull();
  });

  it('creates an account without an email when the provider gives none', async () => {
    const result = await social.signIn({
      provider: 'facebook',
      token: `fake:${subject()}`,
      termsAccepted: true,
    });
    expect(result).toMatchObject({ isNewUser: true, user: { email: null } });
  });

  it('refuses bad tokens, providers that are off, and suspended accounts', async () => {
    expect(await codeOf(social.signIn({ provider: 'google', token: 'eyJhbGciOi.not.real' }))).toBe(
      IdentityErrors.socialTokenInvalid,
    );
    const googleOnly = new SocialService(
      db,
      new OutboxService('identity'),
      new SessionService(db, `${randomUUID()}${randomUUID()}`),
      [new FakeSocialVerifier('google')],
      { googleClientId: 'web-client' },
    );
    expect(
      await codeOf(googleOnly.signIn({ provider: 'facebook', token: `fake:${subject()}` })),
    ).toBe(IdentityErrors.socialProviderDisabled);
    expect(googleOnly.providers()).toEqual({ google: { clientId: 'web-client' }, facebook: null });

    const sub = subject();
    const { user } = await social.signIn({
      provider: 'google',
      token: google(sub, email()),
      termsAccepted: true,
    });
    await db.manager.update(User, { id: user.id }, { status: 'suspended' });
    expect(await codeOf(social.signIn({ provider: 'google', token: google(sub) }))).toBe(
      IdentityErrors.userSuspended,
    );
  });

  it('lets someone whose account was deleted start again with the same provider account', async () => {
    const sub = subject();
    const mail = email();
    const { user } = await social.signIn({
      provider: 'google',
      token: google(sub, mail),
      termsAccepted: true,
    });
    await db.manager.update(User, { id: user.id }, { status: 'deleted', deletedAt: new Date() });

    const fresh = await social.signIn({
      provider: 'google',
      token: google(sub, mail),
      termsAccepted: true,
    });
    expect(fresh.isNewUser).toBe(true);
    expect(fresh.user.id).not.toBe(user.id);
  });

  it('makes one account when the first sign-in arrives twice at once', async () => {
    const sub = subject();
    const token = google(sub, email());
    const [a, b] = await Promise.all([
      social.signIn({ provider: 'google', token, termsAccepted: true }),
      social.signIn({ provider: 'google', token, termsAccepted: true }),
    ]);
    expect(a.user.id).toBe(b.user.id);
  });
});
