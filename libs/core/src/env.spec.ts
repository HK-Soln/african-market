import { baseEnvSchema, loadEnv, loadNodeEnv, loadServiceEndpoints } from './env';

describe('loadServiceEndpoints', () => {
  it('defaults to localhost and the ports in SERVICES', () => {
    const endpoints = loadServiceEndpoints({});
    expect(endpoints.identity).toEqual({ host: 'localhost', tcpPort: 4101, httpPort: 4201 });
    expect(endpoints.payments).toEqual({ host: 'localhost', tcpPort: 4109, httpPort: 4209 });
  });

  it('takes the host and ports from the environment', () => {
    const endpoints = loadServiceEndpoints({
      IDENTITY_HOST: 'identity.staging.am.internal',
      IDENTITY_TCP_PORT: '5101',
      IDENTITY_HTTP_PORT: '5201',
    });
    expect(endpoints.identity).toEqual({
      host: 'identity.staging.am.internal',
      tcpPort: 5101,
      httpPort: 5201,
    });
    expect(endpoints.shops.host).toBe('localhost');
  });

  it('refuses a port that is not a number', () => {
    expect(() => loadServiceEndpoints({ SHOPS_TCP_PORT: 'abc' })).toThrow(/SHOPS_TCP_PORT/);
  });
});

describe('baseEnvSchema', () => {
  it('has a default for every key', () => {
    const env = loadEnv(baseEnvSchema, {});
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      TYPEORM_LOGGING: false,
      OUTBOX_POLL_MS: 500,
      DATABASE_URL: 'postgres://am:am@localhost:5432/african_market',
    });
  });

  it('reads booleans and numbers from their text', () => {
    const env = loadEnv(baseEnvSchema, { TYPEORM_LOGGING: 'true', OUTBOX_POLL_MS: '250' });
    expect(env.TYPEORM_LOGGING).toBe(true);
    expect(env.OUTBOX_POLL_MS).toBe(250);
  });

  it('refuses a value it does not understand instead of guessing', () => {
    expect(() => loadEnv(baseEnvSchema, { TYPEORM_LOGGING: 'maybe' })).toThrow(/TYPEORM_LOGGING/);
    expect(() => loadEnv(baseEnvSchema, { OUTBOX_POLL_MS: '0' })).toThrow(/OUTBOX_POLL_MS/);
  });
});

describe('loadNodeEnv', () => {
  it('reads NODE_ENV alone', () => {
    expect(loadNodeEnv({ NODE_ENV: 'test', OUTBOX_POLL_MS: 'not checked here' })).toBe('test');
    expect(loadNodeEnv({})).toBe('development');
  });
});
