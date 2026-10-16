import type { SocialConfig } from '@am/ui';
import { api } from './api';

/**
 * The social sign-in switched on, for the sign-in screen (the gateway lets this be cached for five
 * minutes). If it cannot be reached the screen still works, with phone and email only.
 */
export async function socialProviders(locale: string): Promise<SocialConfig> {
  try {
    const { data } = await api(locale).GET('/api/v1/auth/social/providers');
    if (data) return data;
  } catch (err) {
    console.warn('Social sign-in providers could not be loaded; showing phone and email only', err);
  }
  return {};
}
