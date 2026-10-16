import { createHmac, createSign, generateKeyPairSync } from 'node:crypto';
import {
  FacebookVerifier,
  GoogleVerifier,
  SocialProviderDown,
  SocialTokenRejected,
} from './social-verifier';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'key-1', alg: 'RS256', use: 'sig' };
const NOW = Date.UTC(2026, 9, 17, 10);
const CLIENT = 'web-client.apps.googleusercontent.com';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function googleToken(
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = { alg: 'RS256', kid: 'key-1', typ: 'JWT' },
  key = privateKey,
) {
  const body = {
    iss: 'https://accounts.google.com',
    aud: CLIENT,
    sub: '1234567890',
    email: 'ada@example.com',
    email_verified: true,
    name: 'Ada Obi',
    iat: Math.floor(NOW / 1000) - 10,
    exp: Math.floor(NOW / 1000) + 3600,
    ...claims,
  };
  const signing = `${b64(header)}.${b64(body)}`;
  const signature = createSign('RSA-SHA256').update(signing).sign(key).toString('base64url');
  return `${signing}.${signature}`;
}

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' }, ...init });

describe('GoogleVerifier', () => {
  let certFetches = 0;
  const fakeFetch = (async () => {
    certFetches++;
    return json({ keys: [jwk] }, { headers: { 'cache-control': 'public, max-age=20000' } });
  }) as typeof fetch;
  const verifier = new GoogleVerifier([CLIENT, 'seller-client'], fakeFetch, () => NOW);

  it('accepts a token Google signed for our client, and caches Google’s keys', async () => {
    expect(await verifier.verify(googleToken())).toEqual({
      subject: '1234567890',
      email: 'ada@example.com',
      name: 'Ada Obi',
    });
    await verifier.verify(googleToken({ aud: 'seller-client' }));
    expect(certFetches).toBe(1);
  });

  it('leaves out an email Google has not verified', async () => {
    expect((await verifier.verify(googleToken({ email_verified: false }))).email).toBeNull();
  });

  it.each([
    ['another app', googleToken({ aud: 'someone-else' })],
    ['an expired token', googleToken({ exp: Math.floor(NOW / 1000) - 3600 })],
    ['another issuer', googleToken({ iss: 'https://evil.example' })],
    ['a token with no algorithm', googleToken({}, { alg: 'none', kid: 'key-1' })],
    ['a token signed by someone else', googleToken({}, undefined, other.privateKey)],
    ['an unknown key', googleToken({}, { alg: 'RS256', kid: 'key-9' })],
    ['changed claims', googleToken().replace(/\.[^.]+\./, `.${b64({ sub: 'x', aud: CLIENT })}.`)],
    ['garbage', 'not-a-token'],
  ])('refuses %s', async (_label, token) => {
    await expect(verifier.verify(token)).rejects.toBeInstanceOf(SocialTokenRejected);
  });

  it('says Google is down when its keys cannot be read', async () => {
    const down = new GoogleVerifier(
      [CLIENT],
      (async () => new Response('', { status: 503 })) as typeof fetch,
      () => NOW,
    );
    await expect(down.verify(googleToken())).rejects.toBeInstanceOf(SocialProviderDown);
  });
});

describe('FacebookVerifier', () => {
  const APP = '111222333';
  const SECRET = 'app-secret-xyz';
  const TOKEN = 'EAAGm0PX4ZCpsBAFakeTokenValue123';
  const urls: string[] = [];
  const fakeFetch = (
    debug: Record<string, unknown>,
    me: Record<string, unknown> = { id: '42', name: 'Ada', email: 'ada@example.com' },
  ) =>
    (async (url: string | URL) => {
      urls.push(String(url));
      return String(url).includes('/debug_token') ? json({ data: debug }) : json(me);
    }) as typeof fetch;

  it('accepts a valid token of our app and reads the profile with appsecret_proof', async () => {
    const verifier = new FacebookVerifier(
      APP,
      SECRET,
      fakeFetch({ is_valid: true, app_id: APP, user_id: '42' }),
    );
    expect(await verifier.verify(TOKEN)).toEqual({
      subject: '42',
      email: 'ada@example.com',
      name: 'Ada',
    });
    const proof = createHmac('sha256', SECRET).update(TOKEN).digest('hex');
    expect(urls.at(-1)).toContain(`appsecret_proof=${proof}`);
  });

  it('refuses a token of another app, an invalid one, and a profile that does not match', async () => {
    await expect(
      new FacebookVerifier(
        APP,
        SECRET,
        fakeFetch({ is_valid: true, app_id: '999', user_id: '42' }),
      ).verify(TOKEN),
    ).rejects.toBeInstanceOf(SocialTokenRejected);
    await expect(
      new FacebookVerifier(APP, SECRET, fakeFetch({ is_valid: false })).verify(TOKEN),
    ).rejects.toBeInstanceOf(SocialTokenRejected);
    await expect(
      new FacebookVerifier(
        APP,
        SECRET,
        fakeFetch({ is_valid: true, app_id: APP, user_id: '42' }, { id: '43' }),
      ).verify(TOKEN),
    ).rejects.toBeInstanceOf(SocialTokenRejected);
  });
});
