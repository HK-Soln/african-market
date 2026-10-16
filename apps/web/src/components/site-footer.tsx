import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

/** On every page: the legal texts and the account page, where people use their data rights. */
export async function SiteFooter() {
  const t = await getTranslations('footer');
  return (
    <footer className="mt-12 border-t border-line px-4 py-6 text-[13px] text-ink-muted">
      <nav aria-label={t('label')} className="mx-auto flex max-w-3xl flex-wrap gap-x-5 gap-y-2">
        <Link href="/legal/terms" className="underline">
          {t('terms')}
        </Link>
        <Link href="/legal/privacy" className="underline">
          {t('privacy')}
        </Link>
        <Link href="/account" className="underline">
          {t('yourData')}
        </Link>
      </nav>
    </footer>
  );
}
