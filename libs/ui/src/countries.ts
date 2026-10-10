import type { Locale } from '@am/i18n';

/**
 * The UAE and the countries most customers and products come from. Used by the phone country
 * picker and by origin badges. Flags are emoji for now; the country name is always shown with one.
 */
export const COUNTRIES = {
  AE: { flag: '🇦🇪', dial: '+971', en: 'UAE', ar: 'الإمارات', fr: 'Émirats' },
  NG: { flag: '🇳🇬', dial: '+234', en: 'Nigeria', ar: 'نيجيريا', fr: 'Nigeria' },
  GH: { flag: '🇬🇭', dial: '+233', en: 'Ghana', ar: 'غانا', fr: 'Ghana' },
  KE: { flag: '🇰🇪', dial: '+254', en: 'Kenya', ar: 'كينيا', fr: 'Kenya' },
  ET: { flag: '🇪🇹', dial: '+251', en: 'Ethiopia', ar: 'إثيوبيا', fr: 'Éthiopie' },
  CM: { flag: '🇨🇲', dial: '+237', en: 'Cameroon', ar: 'الكاميرون', fr: 'Cameroun' },
  SN: { flag: '🇸🇳', dial: '+221', en: 'Senegal', ar: 'السنغال', fr: 'Sénégal' },
  UG: { flag: '🇺🇬', dial: '+256', en: 'Uganda', ar: 'أوغندا', fr: 'Ouganda' },
  ZA: { flag: '🇿🇦', dial: '+27', en: 'South Africa', ar: 'جنوب أفريقيا', fr: 'Afrique du Sud' },
} as const satisfies Record<string, { flag: string; dial: string } & Record<Locale, string>>;

export type CountryCode = keyof typeof COUNTRIES;

export const COUNTRY_CODES = Object.keys(COUNTRIES) as CountryCode[];
