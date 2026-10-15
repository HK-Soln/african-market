import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js';

/** Numbers typed without a country code are read as UAE numbers. */
export const DEFAULT_PHONE_REGION: CountryCode = 'AE';

/**
 * Returns the number in E.164 (`+971501234567`), or null when it is not a valid phone number.
 * International numbers are accepted when written with their country code, because many users
 * keep a home-country number for WhatsApp.
 */
export function normalizePhone(
  input: string,
  defaultRegion: CountryCode = DEFAULT_PHONE_REGION,
): string | null {
  const parsed = parsePhoneNumberFromString(input.trim(), defaultRegion);
  return parsed?.isValid() ? parsed.number : null;
}

/** The country of an E.164 number (`+971501234567` -> `AE`), or null when it cannot tell. */
export function phoneCountry(e164: string): string | null {
  return parsePhoneNumberFromString(e164)?.country ?? null;
}
