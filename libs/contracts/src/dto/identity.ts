/**
 * Request and response shapes for the identity service's TCP patterns (`IdentityPatterns`).
 * The gateway validates its own HTTP DTOs and then sends these.
 */

/** How a one-time code reaches a phone. Email codes arrive with F0-04. */
export type OtpDeliveryChannel = 'sms' | 'whatsapp';

export interface RequestOtpRequest {
  /** Any format; the service normalises to E.164 with default region AE. */
  phone: string;
  channel?: OtpDeliveryChannel;
  /** Language of the message sent to the phone. */
  locale?: string;
  /** Caller's IP as seen by the gateway, for the per-IP limit. */
  ip?: string;
}

export interface RequestOtpResponse {
  /** The phone in E.164, as it must be sent back to `verifyOtp`. */
  phone: string;
  channel: OtpDeliveryChannel;
  /** ISO-8601 UTC. */
  expiresAt: string;
  resendAfterSeconds: number;
}

export interface VerifyOtpRequest {
  phone: string;
  code: string;
  /** Used only when this verification creates the account. */
  preferredLanguage?: string;
  /** Must be true to create an account; ignored for an existing one. */
  termsAccepted?: boolean;
  marketingConsent?: boolean;
  /** Request id from the gateway, carried onto the `user.registered` event. */
  correlationId?: string;
}

export interface UserDto {
  id: string;
  phone: string | null;
  email: string | null;
  name: string | null;
  preferredLanguage: string;
  roles: Array<'customer' | 'seller' | 'admin'>;
  phoneVerified: boolean;
  emailVerified: boolean;
  /** ISO-8601 UTC. */
  createdAt: string;
}

export interface VerifyOtpResponse {
  user: UserDto;
  /** True when this verification created the account. */
  isNewUser: boolean;
}

/** Stable error codes returned by identity; frontends map them to translated messages. */
export const IdentityErrors = {
  validationFailed: 'IDENTITY_VALIDATION_FAILED',
  phoneInvalid: 'PHONE_INVALID',
  otpResendTooSoon: 'OTP_RESEND_TOO_SOON',
  otpRateLimited: 'OTP_RATE_LIMITED',
  otpSendFailed: 'OTP_SEND_FAILED',
  /** `details.attemptsLeft` says how many more guesses this code allows. */
  otpInvalid: 'OTP_INVALID',
  otpExpired: 'OTP_EXPIRED',
  otpTooManyAttempts: 'OTP_TOO_MANY_ATTEMPTS',
  termsNotAccepted: 'TERMS_NOT_ACCEPTED',
  userSuspended: 'USER_SUSPENDED',
} as const;

export type IdentityErrorCode = (typeof IdentityErrors)[keyof typeof IdentityErrors];
