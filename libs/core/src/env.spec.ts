import { baseEnvSchema, loadEnv, loadNodeEnv, loadServiceEndpoints, loadServicePorts } from './env';

const hosts = Object.fromEntries(
  [
    'identity',
    'shops',
    'catalog',
    'discovery',
    'media',
    'messaging',
    'notifications',
    'orders',
    'payments',
  ].map((name) => [`${name.toUpperCase()}_HOST`, `${name}.staging.am.internal`]),
);

const connections = {
  DATABASE_URL: 'postgres://am:am@db:5432/african_market',
  RABBITMQ_URL: 'amqp://am:am@mq:5672',
  REDIS_URL: 'redis://cache:6379',
};

describe('loadServiceEndpoints', () => {
  it('takes every host from the environment, and the ports from SERVICES', () => {
    const endpoints = loadServiceEndpoints(hosts);
    expect(endpoints.identity).toEqual({
      host: 'identity.staging.am.internal',
      tcpPort: 4101,
      httpPort: 4201,
    });
    expect(endpoints.payments.tcpPort).toBe(4109);
  });

  it('lets the environment override a port', () => {
    expect(loadServiceEndpoints({ ...hosts, IDENTITY_TCP_PORT: '5101' }).identity.tcpPort).toBe(
      5101,
    );
  });

  it('stops when a host is missing, and names it', () => {
    const { SHOPS_HOST: _shops, ...withoutShops } = hosts;
    expect(() => loadServiceEndpoints(withoutShops)).toThrow(/SHOPS_HOST/);
  });

  it('refuses a port that is not a number', () => {
    expect(() => loadServiceEndpoints({ ...hosts, SHOPS_TCP_PORT: 'abc' })).toThrow(
      /SHOPS_TCP_PORT/,
    );
  });
});

describe('loadServicePorts', () => {
  it('needs no host: a service only listens', () => {
    expect(loadServicePorts('identity', {})).toEqual({ tcpPort: 4101, httpPort: 4201 });
    expect(loadServicePorts('identity', { IDENTITY_HTTP_PORT: '5201' }).httpPort).toBe(5201);
  });
});

describe('baseEnvSchema', () => {
  it('has no default for where the database, broker and cache are', () => {
    for (const key of Object.keys(connections)) {
      const { [key as keyof typeof connections]: _left, ...rest } = connections;
      expect(() => loadEnv(baseEnvSchema, rest)).toThrow(new RegExp(key));
    }
  });

  it('defaults what is the same everywhere', () => {
    expect(loadEnv(baseEnvSchema, connections)).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      TYPEORM_LOGGING: false,
      OUTBOX_POLL_MS: 500,
    });
  });

  it('reads booleans and numbers from their text', () => {
    const env = loadEnv(baseEnvSchema, {
      ...connections,
      TYPEORM_LOGGING: 'true',
      OUTBOX_POLL_MS: '250',
    });
    expect(env.TYPEORM_LOGGING).toBe(true);
    expect(env.OUTBOX_POLL_MS).toBe(250);
  });

  it('refuses a value it does not understand instead of guessing', () => {
    expect(() => loadEnv(baseEnvSchema, { ...connections, TYPEORM_LOGGING: 'maybe' })).toThrow(
      /TYPEORM_LOGGING/,
    );
    expect(() => loadEnv(baseEnvSchema, { ...connections, DATABASE_URL: 'not a url' })).toThrow(
      /DATABASE_URL/,
    );
  });
});

describe('telemetry keys', () => {
  it('are off when unset or empty', () => {
    for (const value of [undefined, '']) {
      const env = loadEnv(baseEnvSchema, {
        ...connections,
        OTEL_EXPORTER_OTLP_ENDPOINT: value,
        SENTRY_DSN: value,
      });
      expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
      expect(env.SENTRY_DSN).toBeUndefined();
      expect(env.OTEL_TRACES_SAMPLE_RATIO).toBe(1);
    }
  });

  it('refuses an endpoint or DSN that is not a URL, and a ratio outside 0 to 1', () => {
    for (const [key, value] of [
      ['OTEL_EXPORTER_OTLP_ENDPOINT', 'localhost:4318'],
      ['SENTRY_DSN', 'abc'],
      ['OTEL_TRACES_SAMPLE_RATIO', '-0.1'],
    ]) {
      expect(() => loadEnv(baseEnvSchema, { ...connections, [key]: value })).toThrow(
        new RegExp(key),
      );
    }
  });
});

describe('loadNodeEnv', () => {
  it('reads NODE_ENV alone', () => {
    expect(loadNodeEnv({ NODE_ENV: 'test' })).toBe('test');
    expect(loadNodeEnv({})).toBe('development');
  });
});
