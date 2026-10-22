import { getTranslations, setRequestLocale } from 'next-intl/server';
import { pickLocalized, type Locale } from '@am/i18n';
import { LinkButton } from '@am/ui';
import { EmirateChoices } from '@/components/location/emirate-choices';
import { LocationBar } from '@/components/location/location-bar';
import { LocationProvider } from '@/components/location/location-provider';
import { HomeSearch, NearYou } from '@/components/search/home-search';
import { SearchDataProvider } from '@/components/search/search-data';
import { Link } from '@/i18n/navigation';
import { config } from '@/lib/config';
import { serverLocation } from '@/lib/location/server';
import { MapsProvider } from '@/lib/maps';
import { DEFAULT_SEARCH, searchQueryString } from '@/lib/search/params';
import { categories, firstPage, originCountries } from '@/lib/search/server';

/** Rendered per request: the results depend on the visitor's location cookie. */
export const dynamic = 'force-dynamic';

/** Shops shown near the visitor on the home page; the rest are one tap away. */
const NEAR_YOU = 4;

/** Home: where to search from, the search box, shops near you, then categories and emirates. */
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const s = await getTranslations('search');
  const location = await serverLocation();

  const [near, categoryList, countries] = await Promise.all([
    location ? firstPage(locale, DEFAULT_SEARCH, location, NEAR_YOU) : Promise.resolve(null),
    categories(locale),
    originCountries(locale),
  ]);
  const topCategories = categoryList.filter((c) => !c.parentId);

  return (
    <MapsProvider>
      <LocationProvider initial={location}>
        <SearchDataProvider categories={categoryList} countries={countries} emirates={[]}>
          <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-10">
            <section className="flex flex-col gap-4">
              <h1 className="text-[28px] leading-9 font-bold">{t('tagline')}</h1>
              <LocationBar />
              <HomeSearch />
            </section>

            {near && near.items.length > 0 && (
              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold">{t('nearYou')}</h2>
                  <Link href="/search" className="text-[15px] font-semibold text-clay-ink">
                    {s('seeAll')}
                  </Link>
                </div>
                <NearYou page={near} />
              </section>
            )}

            {topCategories.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">{t('browseByCategory')}</h2>
                <ul className="flex flex-wrap gap-2">
                  {topCategories.map((category) => (
                    <li key={category.id}>
                      <Link
                        className="am-chip"
                        href={`/search${searchQueryString({ ...DEFAULT_SEARCH, categoryId: category.id })}`}
                      >
                        <span>{pickLocalized(category.name, locale as Locale)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold">{t('browseByEmirate')}</h2>
              <EmirateChoices />
            </section>

            <LinkButton href={config.sellerUrl} variant="ghost" className="self-start">
              {t('forSellers')}
            </LinkButton>
          </main>
        </SearchDataProvider>
      </LocationProvider>
    </MapsProvider>
  );
}
