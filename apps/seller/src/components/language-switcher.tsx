'use client';

import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@am/i18n';
import { LanguageSwitcher as LanguageControl } from '@am/ui';
import { useSession } from '@/components/session-provider';
import { usePathname, useRouter } from '@/i18n/navigation';
import { auth } from '@/lib/browser-api';

/**
 * Changes the URL locale, which sets `lang`, `dir` and the font stack on `<html>`. For someone
 * signed in the choice is also saved to their account, so messages and emails follow it.
 */
export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations('language');
  const router = useRouter();
  const pathname = usePathname();
  const session = useSession();
  return (
    <LanguageControl
      value={locale}
      label={t('label')}
      onChange={(next) => {
        router.replace(pathname, { locale: next, scroll: false });
        if (session.status !== 'signed-in') return;
        void auth.updateProfile({ preferredLanguage: next }).then((result) => {
          if (result.ok) session.setUser(result.data.user);
        });
      }}
    />
  );
}
