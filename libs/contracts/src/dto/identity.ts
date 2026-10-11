/**
 * Request and response shapes for the identity service's TCP patterns (`IdentityPatterns`).
 * The gateway validates its own HTTP DTOs and then sends these.
 */

/**
 * How a one-time code reaches a phone. WhatsApp is the default (decision P-09); SMS is an
 * optional fallback. Email codes arrive with F0-04.
 */
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
  /** Wait before asking again. Starts at 30 and doubles with each code sent in the hour. */
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
  emailInvalid: 'EMAIL_INVALID',
  passwordTooShort: 'PASSWORD_TOO_SHORT',
  passwordTooLong: 'PASSWORD_TOO_LONG',
  /** Wrong email or wrong password; deliberately not said which. */
  invalidCredentials: 'INVALID_CREDENTIALS',
  /** The password was right but the address has not been verified yet; ask for the code. */
  emailNotVerified: 'EMAIL_NOT_VERIFIED',
  loginRateLimited: 'LOGIN_RATE_LIMITED',
  emailSendFailed: 'EMAIL_SEND_FAILED',
} as const;

export type IdentityErrorCode = (typeof IdentityErrors)[keyof typeof IdentityErrors];

// ---- Email and password (F0-04)

export interface RegisterWithEmailRequest {
  email: string;
  /** At least 10 characters. */
  password: string;
  name?: string;
  preferredLanguage?: string;
  /** Must be true: an account cannot be created without accepting the terms. */
  termsAccepted: boolean;
  marketingConsent?: boolean;
  /** Language of the email. */
  locale?: string;
  ip?: string;
}

/**
 * The same whether the address is new, awaiting verification or already registered, so
 * registration cannot be used to find out who has an account.
 */
export interface EmailCodeResponse {
  email: string;
  /** ISO-8601 UTC. */
  expiresAt: string;
  resendAfterSeconds: number;
}

export interface ResendEmailCodeRequest {
  email: string;
  locale?: string;
  ip?: string;
}

export interface VerifyEmailRequest {
  email: string;
  code: string;
  /**
   * The password chosen at registration, sent again. The code alone is not enough: it proves
   * who reads the inbox, and the password proves this is the person who registered. Without it,
   * someone who re-registered a pending address could have their own password confirmed by the
   * inbox owner.
   */
  password: string;
  /** Request id from the gateway, carried onto the `user.registered` event. */
  correlationId?: string;
}

export interface LoginWithPasswordRequest {
  email: string;
  password: string;
  ip?: string;
}

export interface AuthenticatedUserResponse {
  user: UserDto;
}

export interface RequestPasswordResetRequest {
  email: string;
  locale?: string;
  ip?: string;
}

export interface ResetPasswordRequest {
  email: string;
  code: string;
  newPassword: string;
}

export const PASSWORD_MIN_LENGTH = 10;
/** Upper bound so a huge password cannot be used to tie up the hashing. */
export const PASSWORD_MAX_LENGTH = 128;
