import { randomInt } from 'node:crypto';
import { test as base, expect, type APIRequestContext } from '@playwright/test';
// The tests read the web app's translations (data, not code) to find things by their real labels.
/* eslint-disable no-restricted-imports */
import ar from '../apps/web/messages/ar.json';
import en from '../apps/web/messages/en.json';
/* eslint-enable no-restricted-imports */
import { GATEWAY_URL } from './urls';

/** The app's own words, so a test finds a button by what a person reads in that language. */
export const messages = { en, ar };
export type TestLocale = keyof typeof messages;

/** A UAE mobile number nobody has used in this run. */
export function newPhone(): { national: string; e164: string } {
  const national = `50${randomInt(1_000_000, 9_999_999)}`;
  return { national, e164: `+971${national}` };
}

/**
 * One of the test numbers from E2E_TEST_NUMBERS (`<phone>:<code>,...`, the same list identity
 * has as OTP_TEST_NUMBERS): a number whose code is fixed and never sent.
 */
export function testNumber(index: number): { national: string; e164: string; code: string } {
  const entries = (process.env.E2E_TEST_NUMBERS ?? '').split(',').filter(Boolean);
  const entry = entries[index];
  if (!entry)
    throw new Error(`E2E_TEST_NUMBERS needs at least ${index + 1} <phone>:<code> entries`);
  const [e164, code] = entry.trim().split(':');
  if (!e164?.startsWith('+971') || !/^\d{6}$/.test(code ?? ''))
    throw new Error('E2E_TEST_NUMBERS: each entry is +971<number>:<six-digit code>');
  return { e164, national: e164.slice('+971'.length), code };
}

export interface Api {
  /**
   * The code the backend "sent" to a phone. Only works against a backend running with
   * NODE_ENV=test; anywhere else the route does not exist.
   */
  otpFor(phone: string): Promise<string>;
  /** Creates an account by phone through the API and returns the signed-in request context. */
  signUp(options?: {
    name?: string;
    locale?: TestLocale;
  }): Promise<{ phone: string; name: string }>;
}

interface Fixtures {
  api: Api;
  /** A browser that is already signed in as a new person, without going through the screens. */
  signedIn: { phone: string; name: string };
}

async function otpFor(request: APIRequestContext, phone: string): Promise<string> {
  const response = await request.get('/api/v1/test/otp', { params: { phone } });
  expect(
    response.status(),
    'GET /api/v1/test/otp needs the backend to run with NODE_ENV=test (see playwright.config.ts)',
  ).toBe(200);
  const { code } = (await response.json()) as { code: string | null };
  expect(code, `no code was sent to ${phone}`).toMatch(/^\d{6}$/);
  return code as string;
}

export const test = base.extend<Fixtures>({
  api: async ({ playwright, context }, use) => {
    const request = await playwright.request.newContext({ baseURL: GATEWAY_URL });
    await use({
      otpFor: (phone) => otpFor(request, phone),
      signUp: async ({ name = 'Adaeze Okafor', locale = 'en' } = {}) => {
        const { e164 } = newPhone();
        expect(
          (await request.post('/api/v1/auth/otp/request', { data: { phone: e164 } })).ok(),
        ).toBe(true);
        const verified = await request.post('/api/v1/auth/otp/verify', {
          data: {
            phone: e164,
            code: await otpFor(request, e164),
            termsAccepted: true,
            preferredLanguage: locale,
          },
        });
        expect(verified.ok()).toBe(true);
        expect((await request.patch('/api/v1/me', { data: { name } })).ok()).toBe(true);

        // Hand the session to the browser: the cookies, and the hint the app keeps that this
        // browser has signed in before (without it the app does not ask who is signed in).
        await context.addCookies((await request.storageState()).cookies);
        await context.addInitScript(() => window.localStorage.setItem('am.signed-in', '1'));
        return { phone: e164, name };
      },
    });
    await request.dispose();
  },

  signedIn: async ({ api }, use) => {
    await use(await api.signUp());
  },
});

export { expect };
