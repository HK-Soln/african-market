import { baseEnvSchema, loadEnv, loadServiceEndpoints, loadServicePorts } from './env';
import { listOrNone, noneMeansOff } from './settings';
import { testBaseEnv } from './testing';
import { z } from 'zod';

const names = [
  'identity',
  'shops',
  'catalog',
  'discovery',
  'media',
  'messaging',
  'notifications',
  'orders',
  'payments',
];

const endpoints = Object.fromEntries(
  names.flatMap((name, i) => [
    [`${name.toUpperCase()}_HOST`, `${name}.staging.am.internal`],
    [`${name.toUpperCase()}_TCP_PORT`, String(4101 + i)],
    [`${name.toUpperCase()}_HTTP_PORT`, String(4201 + i)],
  ]),
);

describe('loadServiceEndpoints', () => {
  it('takes every host and port from the environment', () => {
    const loaded = loadServiceEndpoints(endpoints);
    expect(loaded.identity).toEqual({
      host: 'identity.staging.am.internal',
      tcpPort: 4101,
      httpPort: 4201,
    });
    expect(loaded.payments.tcpPort).toBe(4109);
  });

  it('stops when a host or a port is missing, and names it', () => {
    for (const key of ['SHOPS_HOST', 'SHOPS_TCP_PORT', 'SHOPS_HTTP_PORT']) {
      const { [key]: _left, ...rest } = endpoints;
      expect(() => loadServiceEndpoints(rest)).toThrow(new RegExp(`${key}: not set`));
    }
  });

  it('refuses a port that is not a number', () => {
    expect(() => loadServiceEndpoints({ ...endpoints, SHOPS_TCP_PORT: 'abc' })).toThrow(
      /SHOPS_TCP_PORT/,
    );
  });
});

describe('loadServicePorts', () => {
  it('needs no host, and no other service: a service only listens', () => {
    expect(
      loadServicePorts('identity', { IDENTITY_TCP_PORT: '4101', IDENTITY_HTTP_PORT: '4201' }),
    ).toEqual({ tcpPort: 4101, httpPort: 4201 });
  });

  it('has no default port', () => {
    expect(() => loadServicePorts('identity', {})).toThrow(/IDENTITY_TCP_PORT: not set/);
  });
});

describe('baseEnvSchema', () => {
  it('has a default for nothing: every key missing alone stops it, by name', () => {
    for (const key of Object.keys(testBaseEnv)) {
      const { [key as keyof typeof testBaseEnv]: _left, ...rest } = testBaseEnv;
      expect(() => loadEnv(baseEnvSchema, rest)).toThrow(new RegExp(`${key}: not set`));
    }
  });

  it('reads booleans and numbers from their text', () => {
    const env = loadEnv(baseEnvSchema, {
      ...testBaseEnv,
      TYPEORM_LOGGING: 'true',
      OUTBOX_POLL_MS: '250',
    });
    expect(env.TYPEORM_LOGGING).toBe(true);
    expect(env.OUTBOX_POLL_MS).toBe(250);
  });

  it('refuses a value it does not understand instead of guessing', () => {
    for (const [key, value] of [
      ['TYPEORM_LOGGING', 'maybe'],
      ['DATABASE_URL', 'not a url'],
      ['DEPLOY_ENV', 'prod'],
      ['LOG_FORMAT', 'fancy'],
    ]) {
      expect(() => loadEnv(baseEnvSchema, { ...testBaseEnv, [key]: value })).toThrow(
        new RegExp(key),
      );
    }
  });

  it('does not read NODE_ENV: DEPLOY_ENV names the environment', () => {
    const env = loadEnv(baseEnvSchema, { ...testBaseEnv, NODE_ENV: 'production' });
    expect(env.DEPLOY_ENV).toBe('test');
    expect(env).not.toHaveProperty('NODE_ENV');
  });
});

describe('telemetry keys', () => {
  it('are off when `none`, but must be written down', () => {
    const env = loadEnv(baseEnvSchema, testBaseEnv);
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
    const { SENTRY_DSN: _dsn, ...withoutDsn } = testBaseEnv;
    expect(() => loadEnv(baseEnvSchema, withoutDsn)).toThrow(/SENTRY_DSN: not set/);
  });

  it('refuses an endpoint or DSN that is not a URL, and a ratio outside 0 to 1', () => {
    for (const [key, value] of [
      ['OTEL_EXPORTER_OTLP_ENDPOINT', 'localhost:4318'],
      ['SENTRY_DSN', 'abc'],
      ['OTEL_TRACES_SAMPLE_RATIO', '-0.1'],
    ]) {
      expect(() => loadEnv(baseEnvSchema, { ...testBaseEnv, [key]: value })).toThrow(
        new RegExp(key),
      );
    }
  });
});

describe('noneMeansOff', () => {
  const schema = z.object({ A: noneMeansOff(), U: noneMeansOff(z.url()) });

  it('turns `none` into undefined, and keeps the rest', () => {
    expect(loadEnv(schema, { A: 'none', U: 'none' })).toEqual({ A: undefined, U: undefined });
    expect(loadEnv(schema, { A: 'x', U: 'https://a.example' })).toEqual({
      A: 'x',
      U: 'https://a.example',
    });
  });

  it('still requires the key, refuses an empty value, and checks a value that is there', () => {
    expect(() => loadEnv(schema, { U: 'none' })).toThrow(/A: not set/);
    expect(() => loadEnv(schema, { A: '', U: 'none' })).toThrow(/A: empty: write `none`/);
    expect(() => loadEnv(schema, { A: 'none', U: 'nope' })).toThrow(/U:/);
  });
});

describe('listOrNone', () => {
  const schema = z.object({ L: listOrNone(z.enum(['a', 'b'])) });

  it('reads a list, or `none` as an empty one', () => {
    expect(loadEnv(schema, { L: 'a, b' }).L).toEqual(['a', 'b']);
    expect(loadEnv(schema, { L: 'none' }).L).toEqual([]);
  });

  it('refuses an empty value and an item it does not know', () => {
    expect(() => loadEnv(schema, { L: '' })).toThrow(/write `none`/);
    expect(() => loadEnv(schema, { L: 'a,c' })).toThrow(/L/);
  });
});
