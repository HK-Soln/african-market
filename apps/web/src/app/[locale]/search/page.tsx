import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { pickLocalized, type Locale } from '@am/i18n';
import { LocationProvider } from '@/components/location/location-provider';
import { SearchDataProvider } from '@/components/search/search-data';
import { SearchScreen } from '@/components/search/search-screen';
import { serverLocation } from '@/lib/location/server';
import { MapsProvider } from '@/lib/maps';
import { parseSearch } from '@/lib/search/params';
import { categories, emirates, firstPage, originCountries } from '@/lib/search/server';

/** Rendered per request: results depend on the address and the visitor's location cookie. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'search' });
  // Results change by the minute and by visitor: shop pages are what search engines should list.
  return { title: t('metaTitle'), robots: { index: false, follow: true } };
}

/** Search results (F1-11): list or map, filters in the address, near the chosen location. */
export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const state = parseSearch(await searchParams);
  const location = await serverLocation();

  const [page, categoryList, countries, emirateList] = await Promise.all([
    location ? firstPage(locale, state, location) : Promise.resolve(undefined),
    categories(locale),
    originCountries(locale),
    emirates(locale),
  ]);
  const emirate = location?.emirate
    ? emirateList.find((e) => e.code === location.emirate)
    : undefined;
  const closedEmirate =
    emirate && !emirate.searchOpen ? pickLocalized(emirate.name, locale as Locale) : undefined;

  return (
    <MapsProvider>
      <LocationProvider initial={location}>
        <SearchDataProvider categories={categoryList} countries={countries} emirates={emirateList}>
          <SearchScreen state={state} initial={page} closedEmirate={closedEmirate} />
        </SearchDataProvider>
      </LocationProvider>
    </MapsProvider>
  );
}
