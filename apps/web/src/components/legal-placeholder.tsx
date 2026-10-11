import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/**
 * Stands in for the Terms and the Privacy policy until the owner supplies the reviewed text
 * (F0-16). The sign-in screens link here, so the links must lead somewhere.
 */
export async function LegalPlaceholder({ title }: { title: 'termsTitle' | 'privacyTitle' }) {
  const t = await getTranslations('legal');
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-10">
      <h1 className="text-[28px] leading-9 font-bold">{t(title)}</h1>
      <p className="text-ink-muted">{t('pending')}</p>
      <Link href="/" className="self-start font-semibold text-clay underline">
        {t('backHome')}
      </Link>
    </main>
  );
}
