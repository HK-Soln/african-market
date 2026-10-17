'use client';

import { useTranslations } from 'next-intl';
import { SearchBar } from '@am/ui';
import { useRouter } from '@/i18n/navigation';
import { DEFAULT_SEARCH, searchQueryString } from '@/lib/search/params';
import { ResultCard } from './result-card';
import type { NearbyPage } from '@/lib/search/server';

/** The home search box: opens the results page for the text. */
export function HomeSearch() {
  const t = useTranslations('home');
  const s = useTranslations('search');
  const router = useRouter();
  return (
    <SearchBar
      label={s('label')}
      placeholder={t('searchPlaceholder')}
      action="search"
      onSearch={(q) => router.push(`/search${searchQueryString({ ...DEFAULT_SEARCH, q })}`)}
    />
  );
}

/** The first few shops near the visitor, on the home page. */
export function NearYou({ page }: { page: NearbyPage }) {
  return (
    <ol className="flex flex-col gap-3">
      {page.items.map((item) => (
        <li key={item.branchId}>
          <ResultCard item={item} />
        </li>
      ))}
    </ol>
  );
}
