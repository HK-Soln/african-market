import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EMIRATES } from '@am/geo';
import { Button, LinkButton } from '@am/ui';

/**
 * Home: search + nearby. Phase 1 replaces the placeholders with the map/list
 * search backed by GET /api/v1/search/nearby (see docs/directives/01-discovery-mvp.md).
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const e = await getTranslations('emirates');

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">{t('tagline')}</h1>
        <form className="flex gap-2" role="search">
          <input
            name="q"
            type="search"
            placeholder={t('searchPlaceholder')}
            className="min-w-0 flex-1 rounded-xl border border-ink-200 bg-white px-4 py-2.5"
          />
          <Button type="button" variant="secondary">
            {t('useMyLocation')}
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">{t('browseByEmirate')}</h2>
        <ul className="flex flex-wrap gap-2">
          {EMIRATES.map((emirate) => (
            <li
              key={emirate.code}
              className="rounded-full border border-ink-200 bg-white px-3 py-1 text-sm"
            >
              {e(emirate.code)}
            </li>
          ))}
        </ul>
      </section>

      <LinkButton href="http://localhost:3001" variant="ghost" className="self-start">
        {t('forSellers')}
      </LinkButton>
    </main>
  );
}
