import { AsYouType, getExampleNumber, type CountryCode as PhoneRegion } from 'libphonenumber-js';
import mobileExamples from 'libphonenumber-js/mobile/examples';
import type { Locale } from '@am/i18n';

/**
 * A country as the apps get it from the gateway (`GET /api/v1/countries`). The list lives in
 * identity's database and admins edit it; how numbers are written comes from libphonenumber-js.
 */
export interface CountryOption {
  /** ISO 3166-1 alpha-2, e.g. AE. */
  code: string;
  name: { en: string; ar: string; fr: string };
  /** e.g. +971 */
  dialCode: string;
  /** Emoji flag, used where an image cannot be. */
  flag: string;
}

/**
 * The UAE, for when the list could not be loaded: sign-in still works with a UAE number. Matches
 * the seeded row.
 */
export const UAE: CountryOption = {
  code: 'AE',
  name: { en: 'United Arab Emirates', ar: 'الإمارات العربية المتحدة', fr: 'Émirats arabes unis' },
  dialCode: '+971',
  flag: '🇦🇪',
};

/** Lower case, without accents or Arabic diacritics, so "Côte" finds "cote" and "مصر" finds "مِصر". */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '')
    .toLowerCase()
    .trim();

/**
 * Whether a country matches what was typed in a picker's search: its name in any language, its
 * ISO code (`NG`) or its dial code (`234`, `+234`).
 */
export function matchesCountry(country: CountryOption, query: string): boolean {
  const needle = fold(query);
  if (!needle) return true;
  const digits = needle.replace(/^\+/, '');
  if (/^\d+$/.test(digits)) return country.dialCode.slice(1).startsWith(digits);
  if (needle.length <= 3 && country.code.toLowerCase() === needle) return true;
  return Object.values(country.name).some((name) => fold(name).includes(needle));
}

export const countryName = (country: Pick<CountryOption, 'name'>, locale: Locale): string =>
  country.name[locale] || country.name.en;

/**
 * A typical mobile number for the country, written as people type it after the country code:
 * `50 123 4567` for the UAE, `802 123 4567` for Nigeria. Empty when there is no example.
 */
export function phonePlaceholder(country: Pick<CountryOption, 'code' | 'dialCode'>): string {
  const example = getExampleNumber(country.code as PhoneRegion, mobileExamples);
  return example ? afterDialCode(example.formatInternational(), country.dialCode) : '';
}

/**
 * Groups the digits as they are typed, the way the country writes its numbers: `501234567`
 * becomes `50 123 4567`. A leading trunk 0 is dropped (it is not part of the number after the
 * country code). Anything that does not make a number is returned as typed.
 */
export function formatPhoneAsTyped(
  country: Pick<CountryOption, 'dialCode'>,
  typed: string,
): string {
  const digits = typed.replace(/\D/g, '').replace(/^0+/, '');
  if (!digits) return '';
  const formatted = new AsYouType().input(`${country.dialCode}${digits}`);
  return formatted.startsWith(country.dialCode)
    ? afterDialCode(formatted, country.dialCode)
    : digits;
}

const afterDialCode = (international: string, dialCode: string): string =>
  international.startsWith(dialCode) ? international.slice(dialCode.length).trim() : international;
