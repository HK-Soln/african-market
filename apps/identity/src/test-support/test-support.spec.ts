import { baseEnvSchema } from '@am/core';
import { assertSafeIdentityEnv, IdentityEnv, identityEnvSchema } from '../config/identity-env';
import { ConsoleSmsProvider, MemorySmsProvider } from '../sms/sms-provider';
import {
  TestSupportController,
  TestSupportModule,
  testSupportModules,
} from './test-support.module';

/** Everything identity requires, as on a laptop; each test sets what it is about. */
const required = {
  DATABASE_URL: 'postgres://am:am@localhost:5432/african_market',
  RABBITMQ_URL: 'amqp://am:am@localhost:5672',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789-0123456789',
  OTP_HMAC_SECRET: 'test-otp-hmac-secret-0123456789-0123456789',
  SMTP_URL: 'smtp://localhost:1025',
  EMAIL_FROM: 'African Market <no-reply@africanmarket.local>',
};

const envWith = (values: Record<string, string>): IdentityEnv =>
  baseEnvSchema.extend(identityEnvSchema.shape).parse({ ...required, ...values });

describe('test-only support for end-to-end tests', () => {
  it('is loaded under NODE_ENV=test and nowhere else', () => {
    expect(testSupportModules('test')).toEqual([TestSupportModule]);
    for (const env of ['development', 'staging', 'production', '', undefined]) {
      expect(testSupportModules(env)).toEqual([]);
    }
  });

  it('refuses the in-memory SMS provider outside a test run', () => {
    for (const NODE_ENV of ['development', 'staging', 'production']) {
      expect(() => assertSafeIdentityEnv(envWith({ NODE_ENV, SMS_PROVIDER: 'memory' }))).toThrow(
        'NODE_ENV=test',
      );
    }
    expect(() =>
      assertSafeIdentityEnv(envWith({ NODE_ENV: 'test', SMS_PROVIDER: 'memory' })),
    ).not.toThrow();
  });

  it('returns the code from the newest message to a phone, however the phone is written', async () => {
    const sms = new MemorySmsProvider();
    const controller = new TestSupportController(sms);
    await sms.send({ to: '+971501234567', channel: 'whatsapp', body: 'Your code is 111111' });
    await sms.send({ to: '+971501234567', channel: 'whatsapp', body: 'Your code is 482913' });
    await sms.send({ to: '+971509999999', channel: 'whatsapp', body: 'Your code is 222222' });

    expect(controller.lastOtp({ phone: '050 123 4567' })).toEqual({ code: '482913' });
    expect(controller.lastOtp({ phone: '+971500000000' })).toEqual({ code: null });
  });

  it('has nothing to give when codes are really being sent', () => {
    const controller = new TestSupportController(new ConsoleSmsProvider());
    expect(controller.lastOtp({ phone: '+971501234567' })).toEqual({ code: null });
  });
});
