import type { ApiClient } from './index';
import type { components } from './schema';

type Schemas = components['schemas'];
export type ApiUser = Schemas['UserResponseDto'];
export type ApiMe = Schemas['MeDto'];

/** A call that either worked or failed with one of the gateway's stable error codes. */
export type ApiResult<T> =
  { ok: true; data: T } | { ok: false; code: string; details?: Record<string, unknown> };

/** Used when there is no usable answer at all: offline, DNS, a proxy's HTML error page. */
export const NETWORK_ERROR = 'NETWORK_ERROR';

interface Outcome<T> {
  data?: T;
  error?: unknown;
}

/** Turns an openapi-fetch outcome, or a thrown network failure, into an `ApiResult`. */
export async function toResult<T>(call: Promise<Outcome<T>>): Promise<ApiResult<T>> {
  let outcome: Outcome<T>;
  try {
    outcome = await call;
  } catch {
    return { ok: false, code: NETWORK_ERROR };
  }
  if (outcome.data !== undefined) return { ok: true, data: outcome.data };
  const error = outcome.error as { code?: unknown; details?: unknown } | undefined;
  return {
    ok: false,
    code: typeof error?.code === 'string' ? error.code : NETWORK_ERROR,
    details:
      typeof error?.details === 'object' && error.details !== null
        ? (error.details as Record<string, unknown>)
        : undefined,
  };
}

/**
 * Everything the sign-in screens and the session need from the gateway, as plain functions that
 * never throw. The screens in `@am/ui` take these as a prop, so they hold no fetch code.
 */
export function createAuthActions(client: ApiClient) {
  return {
    requestOtp: (phone: string) =>
      toResult(client.POST('/api/v1/auth/otp/request', { body: { phone } })),

    verifyOtp: (body: Schemas['VerifyOtpDto']) =>
      toResult(client.POST('/api/v1/auth/otp/verify', { body })),

    register: (body: Schemas['RegisterDto']) =>
      toResult(client.POST('/api/v1/auth/register', { body })),

    resendEmailCode: (email: string) =>
      toResult(client.POST('/api/v1/auth/email/resend', { body: { email } })),

    verifyEmail: (body: Schemas['VerifyEmailDto']) =>
      toResult(client.POST('/api/v1/auth/email/verify', { body })),

    login: (body: Schemas['LoginDto']) => toResult(client.POST('/api/v1/auth/login', { body })),

    /** Google or Facebook, with the token the provider's button gave (F1-09). */
    socialSignIn: (body: Schemas['SocialSignInDto']) =>
      toResult(client.POST('/api/v1/auth/social', { body })),

    forgotPassword: (email: string) =>
      toResult(client.POST('/api/v1/auth/password/forgot', { body: { email } })),

    resetPassword: (body: Schemas['ResetPasswordDto']) =>
      toResult(client.POST('/api/v1/auth/password/reset', { body })),

    me: () => toResult(client.GET('/api/v1/me')),

    updateProfile: (body: Schemas['UpdateMeDto']) => toResult(client.PATCH('/api/v1/me', { body })),

    logout: () => toResult(client.POST('/api/v1/auth/logout')),

    /** Everything identity holds about the signed-in person (PersonalDataExport in @am/contracts). */
    exportData: () => toResult(client.GET('/api/v1/me/export')),

    /** Closes the account; AUTH_REAUTH_REQUIRED when the last sign-in is over 10 minutes old. */
    deleteAccount: () => toResult(client.DELETE('/api/v1/me')),
  };
}

export type AuthActions = ReturnType<typeof createAuthActions>;
