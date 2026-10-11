import { createApiClient, createAuthActions, NETWORK_ERROR } from './index';

const BASE = 'http://gateway.test';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

type Handler = (request: Request) => Response | Promise<Response>;

/** A fetch that records what was asked and answers from the given handler. */
function fakeFetch(handler: Handler) {
  const calls: Array<{ method: string; path: string; language: string | null }> = [];
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    calls.push({
      method: request.method,
      path: new URL(request.url).pathname,
      language: request.headers.get('accept-language'),
    });
    return handler(request);
  };
  return { fetch, calls };
}

describe('createApiClient', () => {
  it('sends the current language with every call', async () => {
    let language = 'ar';
    const { fetch, calls } = fakeFetch(() => json(200, { user: {}, shops: [] }));
    const client = createApiClient({ baseUrl: BASE, locale: () => language, fetch });

    await client.GET('/api/v1/me');
    language = 'fr';
    await client.GET('/api/v1/me');
    expect(calls.map((call) => call.language)).toEqual(['ar', 'fr']);
  });

  it('refreshes the session once and repeats a call that came back 401', async () => {
    let signedIn = false;
    const { fetch, calls } = fakeFetch((request) => {
      const path = new URL(request.url).pathname;
      if (path === '/api/v1/auth/refresh') {
        signedIn = true;
        return json(200, {});
      }
      return signedIn ? json(200, { user: { id: 'u1' }, shops: [] }) : json(401, {});
    });
    const client = createApiClient({ baseUrl: BASE, refreshOnUnauthorized: true, fetch });

    const { data } = await client.GET('/api/v1/me');
    expect(data?.user.id).toBe('u1');
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'GET /api/v1/me',
      'POST /api/v1/auth/refresh',
      'GET /api/v1/me',
    ]);
  });

  it('repeats a call with its body', async () => {
    let signedIn = false;
    const bodies: string[] = [];
    const { fetch } = fakeFetch(async (request) => {
      if (new URL(request.url).pathname === '/api/v1/auth/refresh') {
        signedIn = true;
        return json(200, {});
      }
      bodies.push(await request.text());
      return signedIn ? json(200, { user: {}, shops: [] }) : json(401, {});
    });
    const client = createApiClient({ baseUrl: BASE, refreshOnUnauthorized: true, fetch });

    await client.PATCH('/api/v1/me', { body: { name: 'Amina' } });
    expect(bodies).toEqual(['{"name":"Amina"}', '{"name":"Amina"}']);
  });

  it('shares one refresh between calls that fail together', async () => {
    let signedIn = false;
    const { fetch, calls } = fakeFetch(async (request) => {
      if (new URL(request.url).pathname === '/api/v1/auth/refresh') {
        await new Promise((resolve) => setTimeout(resolve, 20));
        signedIn = true;
        return json(200, {});
      }
      return signedIn ? json(200, { user: {}, shops: [] }) : json(401, {});
    });
    const client = createApiClient({ baseUrl: BASE, refreshOnUnauthorized: true, fetch });

    await Promise.all([client.GET('/api/v1/me'), client.GET('/api/v1/me')]);
    expect(calls.filter((call) => call.path === '/api/v1/auth/refresh')).toHaveLength(1);
  });

  it('gives the 401 back when the refresh is refused, without trying again', async () => {
    const { fetch, calls } = fakeFetch(() => json(401, { code: 'SESSION_INVALID' }));
    const client = createApiClient({ baseUrl: BASE, refreshOnUnauthorized: true, fetch });

    const { response } = await client.GET('/api/v1/me');
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(2);
  });

  it('never refreshes because of a 401 from a sign-in route', async () => {
    const { fetch, calls } = fakeFetch(() => json(401, { code: 'INVALID_CREDENTIALS' }));
    const client = createApiClient({ baseUrl: BASE, refreshOnUnauthorized: true, fetch });

    await client.POST('/api/v1/auth/login', { body: { email: 'a@b.co', password: 'x' } });
    expect(calls).toHaveLength(1);
  });
});

describe('createAuthActions', () => {
  it('returns the data of a call that worked', async () => {
    const { fetch } = fakeFetch(() =>
      json(200, { phone: '+971501234567', channel: 'whatsapp', resendAfterSeconds: 30 }),
    );
    const actions = createAuthActions(createApiClient({ baseUrl: BASE, fetch }));

    expect(await actions.requestOtp('0501234567')).toEqual({
      ok: true,
      data: { phone: '+971501234567', channel: 'whatsapp', resendAfterSeconds: 30 },
    });
  });

  it('returns the gateway error code and details instead of throwing', async () => {
    const { fetch } = fakeFetch(() =>
      json(400, { statusCode: 400, code: 'OTP_INVALID', details: { attemptsLeft: 3 } }),
    );
    const actions = createAuthActions(createApiClient({ baseUrl: BASE, fetch }));

    expect(await actions.verifyOtp({ phone: '+971501234567', code: '000000' })).toEqual({
      ok: false,
      code: 'OTP_INVALID',
      details: { attemptsLeft: 3 },
    });
  });

  it('reports a network failure as its own code', async () => {
    const actions = createAuthActions(
      createApiClient({
        baseUrl: BASE,
        fetch: () => Promise.reject(new TypeError('fetch failed')),
      }),
    );
    expect(await actions.me()).toEqual({ ok: false, code: NETWORK_ERROR });
  });
});
