import { getTranslations, setRequestLocale } from 'next-intl/server';

/** Admin console entry. Phase 1 adds the verification queue, moderation and categories. Admin-only access. */
export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold">{t('queue')}</h1>
      <p className="text-ink-500">{t('tagline')}</p>
    </main>
  );
}
