'use client';

import { useTranslations } from 'next-intl';

/** Puts a gateway error code into words in the current language; unknown codes get a general line. */
export function useErrorText() {
  const errors = useTranslations('errors');
  return (code: string) => (errors.has(code) ? errors(code) : errors('UNKNOWN'));
}
