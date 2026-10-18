import { parsePhoneNumberFromString as parseAny } from 'libphonenumber-js';
import { parsePhoneNumberFromString as parseMobile } from 'libphonenumber-js/mobile';
import type { CountryCode } from 'libphonenumber-js';

export type PhoneCheck =
  { ok: true; e164: string } | { ok: false; reason: 'empty' | 'invalid' | 'not-mobile' };

/** A number as typed in a country's format, checked and written as E.164 (`+9715...`). */
export function checkPhone(typed: string, country: string): PhoneCheck {
  const text = typed.trim();
  if (!text) return { ok: false, reason: 'empty' };
  const parsed = parseAny(text, country as CountryCode);
  return parsed?.isValid() ? { ok: true, e164: parsed.number } : { ok: false, reason: 'invalid' };
}

/**
 * A WhatsApp number must be a mobile number: WhatsApp runs on mobiles, and customers tap it to
 * open a chat. (The mobile metadata only accepts mobile numbers as valid.)
 */
export function checkWhatsapp(typed: string, country: string): PhoneCheck {
  const any = checkPhone(typed, country);
  if (!any.ok) return any;
  const mobile = parseMobile(typed.trim(), country as CountryCode);
  return mobile?.isValid() ? any : { ok: false, reason: 'not-mobile' };
}

/** A stored E.164 number back as the field shows it, and its country, for editing. */
export function splitPhone(
  e164: string | null | undefined,
): { national: string; country: string } | null {
  if (!e164) return null;
  const parsed = parseAny(e164);
  if (!parsed?.country) return null;
  // As the phone field shows it: grouped, after the country code, without a leading 0.
  const international = parsed.formatInternational();
  const dial = `+${parsed.countryCallingCode}`;
  return { national: international.slice(dial.length).trim(), country: parsed.country };
}
