import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { OTP_LENGTH } from './otp.constants';

/** A uniformly random numeric code, zero-padded: "004821". */
export function generateOtpCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0');
}

export const isOtpCodeFormat = (code: string): boolean =>
  new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);

/**
 * HMAC-SHA256 of the code, bound to its challenge id so a hash is useless for any other
 * challenge. A keyed hash, not a slow one: the code is six digits, so secrecy comes from the
 * server-side key, the 5-minute life and the attempt limit.
 */
export function hashOtpCode(secret: string, challengeId: string, code: string): string {
  return createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
}

/** Constant-time comparison of a submitted code against the stored hash. */
export function otpCodeMatches(
  secret: string,
  challengeId: string,
  code: string,
  storedHash: string,
): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashOtpCode(secret, challengeId, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
