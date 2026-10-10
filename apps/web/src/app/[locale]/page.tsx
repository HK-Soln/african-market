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
        <h1 className="text-[28px] leading-9 font-bold">{t('tagline')}</h1>
        <form className="flex gap-2" role="search">
          <input
            name="q"
            type="search"
            aria-label={t('searchPlaceholder')}
            placeholder={t('searchPlaceholder')}
            className="min-h-12 min-w-0 flex-1 rounded-sm border border-line-strong bg-surface-raised px-4 text-base"
          />
          <Button iconStart="current-location">{t('useMyLocation')}</Button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('browseByEmirate')}</h2>
        <ul className="flex flex-wrap gap-2">
          {EMIRATES.map((emirate) => (
            <li
              key={emirate.code}
              className="rounded-full border border-line bg-surface-raised px-3 py-1 text-sm"
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
