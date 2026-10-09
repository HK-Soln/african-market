'use client';

import { useLocale, useTranslations } from 'next-intl';
import { LOCALES } from '@am/i18n';
import { usePathname, useRouter } from '@/i18n/navigation';

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('language');
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      aria-label="Language"
      className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-sm"
      value={locale}
      onChange={(e) => router.replace(pathname, { locale: e.target.value })}
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {t(l)}
        </option>
      ))}
    </select>
  );
}
