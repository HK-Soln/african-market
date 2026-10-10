'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@am/i18n';
import { LanguageSwitcher as LanguageControl } from '@am/ui';
import { usePathname, useRouter } from '@/i18n/navigation';

/** Changes the URL locale, which sets `lang`, `dir` and the font stack on `<html>`. */
export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations('language');
  const router = useRouter();
  const pathname = usePathname();
  return (
    <LanguageControl
      value={locale}
      label={t('label')}
      onChange={(next) => router.replace(pathname, { locale: next, scroll: false })}
    />
  );
}
