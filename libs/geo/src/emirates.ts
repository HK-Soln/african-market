/** The seven emirates. Launch covers all seven (decision 2026-10-09). Centres are approximate, for default map views. */
export const EMIRATES = [
  {
    code: 'DXB',
    slug: 'dubai',
    name: { en: 'Dubai', ar: 'دبي' },
    center: { lat: 25.2048, lng: 55.2708 },
  },
  {
    code: 'AUH',
    slug: 'abu-dhabi',
    name: { en: 'Abu Dhabi', ar: 'أبوظبي' },
    center: { lat: 24.4539, lng: 54.3773 },
  },
  {
    code: 'SHJ',
    slug: 'sharjah',
    name: { en: 'Sharjah', ar: 'الشارقة' },
    center: { lat: 25.3463, lng: 55.4209 },
  },
  {
    code: 'AJM',
    slug: 'ajman',
    name: { en: 'Ajman', ar: 'عجمان' },
    center: { lat: 25.4052, lng: 55.5136 },
  },
  {
    code: 'UAQ',
    slug: 'umm-al-quwain',
    name: { en: 'Umm Al Quwain', ar: 'أم القيوين' },
    center: { lat: 25.5647, lng: 55.5552 },
  },
  {
    code: 'RAK',
    slug: 'ras-al-khaimah',
    name: { en: 'Ras Al Khaimah', ar: 'رأس الخيمة' },
    center: { lat: 25.8007, lng: 55.9762 },
  },
  {
    code: 'FUJ',
    slug: 'fujairah',
    name: { en: 'Fujairah', ar: 'الفجيرة' },
    center: { lat: 25.1288, lng: 56.3265 },
  },
] as const;

export type EmirateCode = (typeof EMIRATES)[number]['code'];
export const EMIRATE_CODES = EMIRATES.map((e) => e.code) as EmirateCode[];
