import { createHmac, createPublicKey, createVerify, type JsonWebKey } from 'node:crypto';
import type { SocialProvider } from '@am/contracts';

/** Who the provider says signed in. */
export interface SocialIdentity {
  /** The provider's stable id for the person (Google `sub`, Facebook user id). */
  subject: string;
  /** Only when the provider vouches for it. */
  email: string | null;
  name: string | null;
}

/** A provider's token was refused (expired, for another app, tampered). */
export class SocialTokenRejected extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SocialTokenRejected';
  }
}

/** The provider could not be reached or answered nonsense. */
export class SocialProviderDown extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SocialProviderDown';
  }
}

/** Checks a provider's token with the provider (CLAUDE.md: providers behind an interface). */
export interface SocialVerifier {
  readonly provider: SocialProvider;
  verify(token: string): Promise<SocialIdentity>;
}

export const SOCIAL_VERIFIERS = Symbol('SOCIAL_VERIFIERS');

type Fetch = typeof fetch;

const b64url = (s: string) => Buffer.from(s, 'base64url');

interface GoogleJwk extends JsonWebKey {
  kid: string;
}

/**
 * Google's ID token, checked here: RS256 signature by one of Google's current keys, issuer, one
 * of our client ids as audience, not expired, and a verified email if it carries one.
 * https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
 */
export class GoogleVerifier implements SocialVerifier {
  readonly provider = 'google' as const;
  private keys: { byKid: Map<string, GoogleJwk>; until: number } | null = null;

  constructor(
    private readonly clientIds: string[],
    private readonly fetchFn: Fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly certsUrl = 'https://www.googleapis.com/oauth2/v3/certs',
  ) {}

  async verify(token: string): Promise<SocialIdentity> {
    const parts = token.split('.');
    if (parts.length !== 3) throw new SocialTokenRejected('not a JWT');
    let header: { alg?: string; kid?: string };
    let claims: Record<string, unknown>;
    try {
      header = JSON.parse(b64url(parts[0]).toString('utf8'));
      claims = JSON.parse(b64url(parts[1]).toString('utf8'));
    } catch {
      throw new SocialTokenRejected('unreadable');
    }
    // Only Google's algorithm: never `none`, never a key the token names itself.
    if (header.alg !== 'RS256' || !header.kid) throw new SocialTokenRejected('wrong algorithm');
    const jwk = await this.key(header.kid);
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    if (!verifier.verify(createPublicKey({ key: jwk, format: 'jwk' }), b64url(parts[2])))
      throw new SocialTokenRejected('bad signature');

    const nowS = Math.floor(this.now() / 1000);
    if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com')
      throw new SocialTokenRejected('wrong issuer');
    if (typeof claims.aud !== 'string' || !this.clientIds.includes(claims.aud))
      throw new SocialTokenRejected('not for this app');
    // A minute of leeway for clocks.
    if (typeof claims.exp !== 'number' || claims.exp < nowS - 60)
      throw new SocialTokenRejected('expired');
    if (typeof claims.iat === 'number' && claims.iat > nowS + 60)
      throw new SocialTokenRejected('issued in the future');
    if (typeof claims.sub !== 'string' || !claims.sub) throw new SocialTokenRejected('no subject');

    const verified = claims.email_verified === true || claims.email_verified === 'true';
    return {
      subject: claims.sub,
      email: verified && typeof claims.email === 'string' ? claims.email : null,
      name: typeof claims.name === 'string' ? claims.name : null,
    };
  }

  /** Google rotates its keys; they are cached as long as Google's own Cache-Control says. */
  private async key(kid: string): Promise<GoogleJwk> {
    if (!this.keys || this.keys.until < this.now() || !this.keys.byKid.has(kid)) await this.load();
    const key = this.keys!.byKid.get(kid);
    if (!key) throw new SocialTokenRejected('unknown key');
    return key;
  }

  private async load(): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchFn(this.certsUrl, { signal: AbortSignal.timeout(5_000) });
    } catch (err) {
      throw new SocialProviderDown(`google keys: ${(err as Error).message}`);
    }
    if (!response.ok) throw new SocialProviderDown(`google keys: HTTP ${response.status}`);
    const body = (await response.json()) as { keys?: GoogleJwk[] };
    const maxAge = Number(
      /max-age=(\d+)/.exec(response.headers.get('cache-control') ?? '')?.[1] ?? 3600,
    );
    this.keys = {
      byKid: new Map(
        (body.keys ?? []).filter((k) => k.kid && k.kty === 'RSA').map((k) => [k.kid, k]),
      ),
      until: this.now() + Math.min(maxAge, 86_400) * 1000,
    };
  }
}

/**
 * A Facebook user access token, checked with Facebook: it must be valid and issued to our app
 * (debug_token with the app's own token), then the profile is read with appsecret_proof.
 * https://developers.facebook.com/docs/facebook-login/guides/access-tokens/debugging
 */
export class FacebookVerifier implements SocialVerifier {
  readonly provider = 'facebook' as const;

  constructor(
    private readonly appId: string,
    private readonly appSecret: string,
    private readonly fetchFn: Fetch = fetch,
    private readonly graphUrl = 'https://graph.facebook.com/v23.0',
  ) {}

  async verify(token: string): Promise<SocialIdentity> {
    if (!/^[A-Za-z0-9_.-]{20,1024}$/.test(token)) throw new SocialTokenRejected('not a token');
    const appToken = `${this.appId}|${this.appSecret}`;
    const debug = await this.get<{
      data?: { is_valid?: boolean; app_id?: string; user_id?: string };
    }>(
      `/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`,
    );
    const data = debug.data;
    if (!data?.is_valid) throw new SocialTokenRejected('not valid');
    if (data.app_id !== this.appId) throw new SocialTokenRejected('not for this app');
    if (!data.user_id) throw new SocialTokenRejected('no user');

    const proof = createHmac('sha256', this.appSecret).update(token).digest('hex');
    const me = await this.get<{ id?: string; name?: string; email?: string }>(
      `/me?fields=id,name,email&access_token=${encodeURIComponent(token)}&appsecret_proof=${proof}`,
    );
    if (me.id !== data.user_id) throw new SocialTokenRejected('profile does not match');
    // Facebook returns only an address its user has confirmed, and only with the email permission.
    return { subject: me.id, email: me.email ?? null, name: me.name ?? null };
  }

  private async get<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchFn(`${this.graphUrl}${path}`, {
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      throw new SocialProviderDown(`facebook: ${(err as Error).message}`);
    }
    if (response.status >= 500) throw new SocialProviderDown(`facebook: HTTP ${response.status}`);
    // 4xx is Facebook refusing the token.
    if (!response.ok) throw new SocialTokenRejected(`facebook: HTTP ${response.status}`);
    return (await response.json()) as T;
  }
}

/**
 * For tests: a token `fake:<subject>[:<email>[:<name>]]` is that person; anything else is refused.
 * Never wired outside NODE_ENV=test.
 */
export class FakeSocialVerifier implements SocialVerifier {
  constructor(readonly provider: SocialProvider) {}

  async verify(token: string): Promise<SocialIdentity> {
    const [scheme, subject, email, name] = token.split(':');
    if (scheme !== 'fake' || !subject) throw new SocialTokenRejected('fake: not a fake token');
    return { subject, email: email || null, name: name || null };
  }
}
