import { baseEnvSchema, loadEnv } from '@am/core';
import { testBaseEnv } from '@am/core/testing';
import { assertSafeIdentityEnv, IdentityEnv, identityEnvSchema } from '../config/identity-env';
import { ConsoleSmsProvider, MemorySmsProvider } from '../sms/sms-provider';
import {
  TestSupportController,
  TestSupportModule,
  testSupportModules,
} from './test-support.module';

/** Everything identity requires, as on a laptop; each test sets what it is about. */
const required = {
  ...testBaseEnv,
  DEPLOY_ENV: 'development',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789-0123456789',
  OTP_HMAC_SECRET: 'test-otp-hmac-secret-0123456789-0123456789',
  SMTP_URL: 'smtp://localhost:1025',
  EMAIL_FROM: 'African Market <no-reply@africanmarket.local>',
  EMAIL_PROVIDER: 'smtp',
  SMS_PROVIDER: 'console',
  OTP_TEST_NUMBERS: 'none',
  SOCIAL_PROVIDERS: 'none',
  GOOGLE_CLIENT_IDS: 'none',
  FACEBOOK_APP_ID: 'none',
  FACEBOOK_APP_SECRET: 'none',
  FAKE_SOCIAL_SIGN_IN: 'false',
  TEST_SUPPORT_ROUTES: 'false',
};

const envWith = (values: Record<string, string>): IdentityEnv =>
  baseEnvSchema.extend(identityEnvSchema.shape).parse({ ...required, ...values });

describe('test-only support for end-to-end tests', () => {
  it('is loaded only when TEST_SUPPORT_ROUTES is switched on', () => {
    expect(testSupportModules(true)).toEqual([TestSupportModule]);
    expect(testSupportModules(false)).toEqual([]);
  });

  it('refuses every test-only setting in staging and production', () => {
    const real = {
      JWT_ACCESS_SECRET: 'a-real-access-secret-0123456789-0123456789',
      OTP_HMAC_SECRET: 'a-real-otp-hmac-secret-0123456789-0123456789',
      SMS_PROVIDER: 'twilio',
    };
    const testOnly: Record<string, string>[] = [
      { SMS_PROVIDER: 'memory' },
      { FAKE_SOCIAL_SIGN_IN: 'true' },
      { TEST_SUPPORT_ROUTES: 'true' },
    ];
    for (const DEPLOY_ENV of ['staging', 'production']) {
      expect(() => assertSafeIdentityEnv(envWith({ ...real, DEPLOY_ENV }))).not.toThrow();
      for (const setting of testOnly) {
        expect(() => assertSafeIdentityEnv(envWith({ ...real, DEPLOY_ENV, ...setting }))).toThrow(
          new RegExp(Object.keys(setting)[0]),
        );
      }
    }
    for (const DEPLOY_ENV of ['development', 'test']) {
      for (const setting of testOnly) {
        expect(() =>
          assertSafeIdentityEnv(envWith({ ...real, DEPLOY_ENV, ...setting })),
        ).not.toThrow();
      }
    }
  });

  it('has a default for none of its keys', () => {
    for (const key of Object.keys(identityEnvSchema.shape)) {
      const values: Record<string, string> = { ...required };
      delete values[key];
      expect(() => loadEnv(baseEnvSchema.extend(identityEnvSchema.shape), values)).toThrow(
        new RegExp(`${key}: not set`),
      );
    }
  });

  it('refuses test numbers in production, and a malformed list anywhere', () => {
    const real = {
      JWT_ACCESS_SECRET: 'a-real-access-secret-0123456789-0123456789',
      OTP_HMAC_SECRET: 'a-real-otp-hmac-secret-0123456789-0123456789',
      SMS_PROVIDER: 'twilio',
      OTP_TEST_NUMBERS: '+971500000001:123456',
    };
    expect(() => assertSafeIdentityEnv(envWith({ ...real, DEPLOY_ENV: 'production' }))).toThrow(
      'must be none in production',
    );
    expect(() => assertSafeIdentityEnv(envWith({ ...real, DEPLOY_ENV: 'staging' }))).not.toThrow();
    expect(() =>
      assertSafeIdentityEnv(envWith({ ...real, DEPLOY_ENV: 'staging', OTP_TEST_NUMBERS: 'x' })),
    ).toThrow('OTP_TEST_NUMBERS');
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

  it('needs the keys of every social provider it switches on', () => {
    const base = { DEPLOY_ENV: 'development', SMS_PROVIDER: 'console' };
    expect(envWith({ ...base, SOCIAL_PROVIDERS: 'none' }).SOCIAL_PROVIDERS).toEqual([]);
    expect(() => envWith({ ...base, SOCIAL_PROVIDERS: '' })).toThrow(/write `none`/);
    expect(() => assertSafeIdentityEnv(envWith({ ...base, SOCIAL_PROVIDERS: 'google' }))).toThrow(
      /GOOGLE_CLIENT_IDS/,
    );
    expect(() =>
      assertSafeIdentityEnv(
        envWith({ ...base, SOCIAL_PROVIDERS: 'facebook', FACEBOOK_APP_ID: '1' }),
      ),
    ).toThrow(/FACEBOOK_APP_SECRET/);
    const both = envWith({
      ...base,
      SOCIAL_PROVIDERS: 'google, facebook',
      GOOGLE_CLIENT_IDS: 'a.apps.googleusercontent.com,b.apps.googleusercontent.com',
      FACEBOOK_APP_ID: '1',
      FACEBOOK_APP_SECRET: 's',
    });
    expect(both.SOCIAL_PROVIDERS).toEqual(['google', 'facebook']);
    expect(both.GOOGLE_CLIENT_IDS).toHaveLength(2);
    expect(() => assertSafeIdentityEnv(both)).not.toThrow();
    expect(() => envWith({ ...base, SOCIAL_PROVIDERS: 'apple' })).toThrow();
  });
});
