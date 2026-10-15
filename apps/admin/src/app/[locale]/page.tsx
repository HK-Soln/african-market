import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { RequireAdmin } from '@/components/require-admin';

/** Admin console entry. Phase 1 adds the verification queue, moderation and categories. */
export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const countries = await getTranslations('countries');
  return (
    <RequireAdmin>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
        <h1 className="text-2xl font-bold">{t('queue')}</h1>
        <p className="text-ink-muted">{t('tagline')}</p>
        <nav>
          <Link className="text-clay underline" href="/countries">
            {countries('title')}
          </Link>
        </nav>
      </main>
    </RequireAdmin>
  );
}
