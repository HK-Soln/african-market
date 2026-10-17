'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { pickLocalized, type Locale } from '@am/i18n';
import { countryName as localName, type CountryOption } from '@am/ui';
import type { Category, Emirate } from '@/lib/search/server';

interface SearchData {
  categories: Category[];
  countries: CountryOption[];
  emirates: Emirate[];
  /** A top-level category's name in this language, else undefined (sub-categories are skipped). */
  categoryName: (id: string) => string | undefined;
  /** The country's name in this language, else its code. */
  countryName: (code: string) => string;
}

const SearchDataContext = createContext<SearchData | null>(null);

/** The lists results are described with, loaded once by the page on the server. */
export function SearchDataProvider({
  categories,
  countries,
  emirates,
  children,
}: Pick<SearchData, 'categories' | 'countries' | 'emirates'> & { children: ReactNode }) {
  const locale = useLocale() as Locale;
  const value = useMemo<SearchData>(() => {
    const top = new Map(
      categories.filter((c) => !c.parentId).map((c) => [c.id, pickLocalized(c.name, locale)]),
    );
    const names = new Map(countries.map((c) => [c.code, localName(c, locale)]));
    return {
      categories,
      countries,
      emirates,
      categoryName: (id) => top.get(id) || undefined,
      countryName: (code) => names.get(code) ?? code,
    };
  }, [categories, countries, emirates, locale]);
  return <SearchDataContext.Provider value={value}>{children}</SearchDataContext.Provider>;
}

export function useSearchData(): SearchData {
  const data = useContext(SearchDataContext);
  if (!data) throw new Error('useSearchData needs a SearchDataProvider');
  return data;
}
