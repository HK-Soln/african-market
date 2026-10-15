import type { CountryOption } from '@am/ui';
import { api } from './api';

/**
 * The countries a new account may sign up from by phone, in display order, for the sign-in
 * screen. The gateway lets this be cached for five minutes. If it cannot be reached the screen
 * still works, with the UAE only.
 */
export async function phoneCountries(locale: string): Promise<CountryOption[]> {
  try {
    const { data } = await api(locale).GET('/api/v1/countries');
    return (data?.countries ?? []).filter((country) => country.phoneEnabled);
  } catch {
    return [];
  }
}
