import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LinkButton } from '@am/ui';
import { EmirateChoices } from '@/components/location/emirate-choices';
import { LocationBar } from '@/components/location/location-bar';
import { LocationProvider } from '@/components/location/location-provider';
import { serverLocation } from '@/lib/location/server';
import { MapsProvider } from '@/lib/maps';

/** Rendered per request: the results depend on the visitor's location cookie. */
export const dynamic = 'force-dynamic';

/**
 * Home: where to search from, then search. The search itself (list and map backed by
 * GET /api/v1/search/nearby) is F1-11 (docs/directives/01-discovery-mvp.md).
 */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const location = await serverLocation();

  return (
    <MapsProvider>
      <LocationProvider initial={location}>
        <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
          <section className="flex flex-col gap-4">
            <h1 className="text-[28px] leading-9 font-bold">{t('tagline')}</h1>
            <LocationBar />
            <form className="flex gap-2" role="search">
              <input
                name="q"
                type="search"
                aria-label={t('searchPlaceholder')}
                placeholder={t('searchPlaceholder')}
                className="min-h-12 min-w-0 flex-1 rounded-sm border border-line-strong bg-surface-raised px-4 text-base"
              />
            </form>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{t('browseByEmirate')}</h2>
            <EmirateChoices />
          </section>

          <LinkButton href="http://localhost:3001" variant="ghost" className="self-start">
            {t('forSellers')}
          </LinkButton>
        </main>
      </LocationProvider>
    </MapsProvider>
  );
}
