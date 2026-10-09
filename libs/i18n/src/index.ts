/** Supported UI locales. English is the default; Arabic is right-to-left; French arrives in Phase 2. */
export const LOCALES = ['en', 'ar', 'fr'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const RTL_LOCALES: readonly Locale[] = ['ar'];

export const isLocale = (value: string): value is Locale =>
  (LOCALES as readonly string[]).includes(value);
export const textDirection = (locale: Locale): 'rtl' | 'ltr' =>
  RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';

/**
 * Translated content stored as `jsonb` on content tables, e.g. `{ "en": "Egusi", "ar": "إيغوسي" }`.
 * Sellers write in their own language; machine translations are flagged in `_mt`.
 */
export type LocalizedText = Partial<Record<Locale, string>> & { _mt?: Locale[] };

/** Picks the best available translation: requested locale, then English, then any value. */
export function pickLocalized(text: LocalizedText | null | undefined, locale: Locale): string {
  if (!text) return '';
  return (
    text[locale] ??
    text.en ??
    Object.entries(text)
      .find(([k, v]) => k !== '_mt' && typeof v === 'string')?.[1]
      ?.toString() ??
    ''
  );
}

/** UAE display conventions. Store UTC; display in Asia/Dubai (UTC+4, no DST). */
export const UAE_TIMEZONE = 'Asia/Dubai';
export const formatAed = (fils: number, locale: Locale = DEFAULT_LOCALE): string =>
  new Intl.NumberFormat(locale === 'ar' ? 'ar-AE' : `${locale}-AE`, {
    style: 'currency',
    currency: 'AED',
  }).format(fils / 100);
