import type { CountryOption } from '@am/ui';
import { api } from './api';

/**
 * The countries a new account may sign up from by phone, in display order, for the sign-in
 * screen. The gateway lets this be cached for five minutes. If it cannot be reached the screen
 * still works, with the UAE only.
 */
export async function phoneCountries(locale: string): Promise<CountryOption[]> {
  try {
    const { data, error, response } = await api(locale).GET('/api/v1/countries');
    if (data) return data.countries.filter((country) => country.phoneEnabled);
    console.warn(
      `Countries could not be loaded (${response.status} ${JSON.stringify(error)}); the phone field offers the UAE only`,
    );
  } catch (err) {
    console.warn('Countries could not be loaded; the phone field offers the UAE only', err);
  }
  return [];
}
