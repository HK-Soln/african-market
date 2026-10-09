import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { UAE_TIMEZONE } from '@am/i18n';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    timeZone: UAE_TIMEZONE,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
