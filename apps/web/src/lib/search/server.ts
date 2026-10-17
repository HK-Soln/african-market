import type { components } from '@am/api-client';
import type { CountryOption } from '@am/ui';
import { api } from '../api';
import { nearbyQuery, type SearchState } from './params';

export type NearbyBranch = components['schemas']['NearbyBranchDto'];
export type Category = components['schemas']['CategoryDto'];
export type Emirate = components['schemas']['EmirateDto'];

export interface NearbyPage {
  items: NearbyBranch[];
  nextCursor: string | null;
}

/** Results per page: a phone screen and a half of rows. */
export const PAGE_SIZE = 20;

/** The first page of results, or null when search could not be reached. */
export async function firstPage(
  locale: string,
  state: SearchState,
  point: { lat: number; lng: number },
  limit = PAGE_SIZE,
): Promise<NearbyPage | null> {
  try {
    const { data, error, response } = await api(locale).GET('/api/v1/search/nearby', {
      params: { query: { ...nearbyQuery(state, point), limit } },
    });
    if (data) return data;
    console.warn(`Search failed (${response.status} ${JSON.stringify(error)})`);
  } catch (err) {
    console.warn('Search could not be reached', err);
  }
  return null;
}

/** Active categories, parents first; empty when they could not be loaded. */
export async function categories(locale: string): Promise<Category[]> {
  try {
    const { data } = await api(locale).GET('/api/v1/categories');
    return data?.items ?? [];
  } catch {
    return [];
  }
}

/** The emirates and whether search is open in each; empty when unknown. */
export async function emirates(locale: string): Promise<Emirate[]> {
  try {
    const { data } = await api(locale).GET('/api/v1/emirates');
    return data?.items ?? [];
  } catch {
    return [];
  }
}

/** Countries shops may say they are from, for the origin filter. */
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
