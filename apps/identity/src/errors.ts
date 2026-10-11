import { AppRpcException } from '@am/core';
import { IdentityErrorCode, IdentityErrors } from '@am/contracts';

const STATUS: Partial<Record<IdentityErrorCode, number>> = {
  [IdentityErrors.invalidCredentials]: 401,
  [IdentityErrors.userSuspended]: 403,
  [IdentityErrors.emailNotVerified]: 403,
  [IdentityErrors.otpTooManyAttempts]: 429,
  [IdentityErrors.otpResendTooSoon]: 429,
  [IdentityErrors.otpRateLimited]: 429,
  [IdentityErrors.loginRateLimited]: 429,
  [IdentityErrors.otpSendFailed]: 502,
  [IdentityErrors.emailSendFailed]: 502,
};

/** Developer-facing text. Frontends show their own translated message for the code. */
const MESSAGE: Record<IdentityErrorCode, string> = {
  [IdentityErrors.validationFailed]: 'Invalid request',
  [IdentityErrors.phoneInvalid]: 'Enter a valid phone number',
  [IdentityErrors.otpResendTooSoon]: 'A code was sent a moment ago',
  [IdentityErrors.otpRateLimited]: 'Too many codes requested',
  [IdentityErrors.otpSendFailed]: 'The code could not be sent',
  [IdentityErrors.otpInvalid]: 'That code did not match',
  [IdentityErrors.otpExpired]: 'That code has expired or was already used',
  [IdentityErrors.otpTooManyAttempts]: 'Too many wrong codes; request a new one',
  [IdentityErrors.termsNotAccepted]: 'The terms must be accepted to create an account',
  [IdentityErrors.userSuspended]: 'This account is suspended',
  [IdentityErrors.emailInvalid]: 'Enter a valid email address',
  [IdentityErrors.passwordTooShort]: 'The password is too short',
  [IdentityErrors.passwordTooLong]: 'The password is too long',
  [IdentityErrors.invalidCredentials]: 'The email or password is wrong',
  [IdentityErrors.emailNotVerified]: 'This email address has not been verified yet',
  [IdentityErrors.loginRateLimited]: 'Too many sign-in attempts; try again later',
  [IdentityErrors.emailSendFailed]: 'The email could not be sent',
};

/** The one place identity turns an error code into what goes back over TCP. */
export function identityError(
  code: IdentityErrorCode,
  details?: Record<string, unknown>,
): AppRpcException {
  return new AppRpcException({
    status: STATUS[code] ?? 400,
    code,
    message: MESSAGE[code],
    details,
  });
}
