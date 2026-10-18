import type { CountryOption } from '@am/ui';
import type { CategoryOption } from '@/components/setup/details-form';
import { api } from './api';

/** Active categories, parents first; empty when they could not be loaded. */
export async function categories(locale: string): Promise<CategoryOption[]> {
  try {
    const { data } = await api(locale).GET('/api/v1/categories');
    return data?.items ?? [];
  } catch {
    return [];
  }
}

/** Countries a shop may say its goods come from. */
export async function originCountries(locale: string): Promise<CountryOption[]> {
  try {
    // Fewer than 100 countries are ever offered as origins: one page.
    const { data } = await api(locale).GET('/api/v1/countries', {
      params: { query: { 'filter[originEnabled]': true, limit: 100 } },
    });
    return data?.items ?? [];
  } catch {
    return [];
  }
}
