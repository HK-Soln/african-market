import type { IconName } from '@am/ui';

/** The console's areas, in the order an admin works through them. */
export const AREAS = ['shops', 'products', 'categories', 'emirates', 'countries', 'audit'] as const;
export type Area = (typeof AREAS)[number];

export const AREA_ICONS: Record<Area, IconName> = {
  shops: 'building-store',
  products: 'package',
  categories: 'list',
  emirates: 'map',
  countries: 'world',
  audit: 'receipt',
};
