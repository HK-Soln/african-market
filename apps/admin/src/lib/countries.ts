import type { CountryOption } from '@am/ui';
import { api } from './api';

/**
 * The countries a new account may sign up from by phone, in display order, for the sign-in
 * screen. The gateway lets this be cached for five minutes. If it cannot be reached the screen
 * still works, with the UAE only.
 */
export async function phoneCountries(locale: string): Promise<CountryOption[]> {
  try {
    // Fewer than 100 countries are ever offered for sign-up: one page.
    const { data, error, response } = await api(locale).GET('/api/v1/countries', {
      params: { query: { 'filter[phoneEnabled]': true, limit: 100 } },
    });
    if (data) return data.items;
    console.warn(
      `Countries could not be loaded (${response.status} ${JSON.stringify(error)}); the phone field offers the UAE only`,
    );
  } catch (err) {
    console.warn('Countries could not be loaded; the phone field offers the UAE only', err);
  }
  return [];
}
