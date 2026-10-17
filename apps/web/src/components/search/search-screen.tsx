'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button, EmptyState, SearchBar, Skeleton, Tabs } from '@am/ui';
import { useDescribe } from '@/components/location/location-bar';
import { LocationPicker } from '@/components/location/location-picker';
import { useSearchLocation } from '@/components/location/location-provider';
import { usePathname, useRouter } from '@/i18n/navigation';
import { mapsConfigured, useMaps } from '@/lib/maps';
import { searchQueryString, type SearchState } from '@/lib/search/params';
import type { NearbyPage } from '@/lib/search/server';
import { SearchFilters } from './search-filters';
import { SearchMap } from './search-map';
import { SearchResults } from './search-results';

export interface SearchScreenProps {
  state: SearchState;
  /** The first page from the server; null when search failed; undefined without a location. */
  initial: NearbyPage | null | undefined;
  /** The emirate's name when the visitor is in one where search is not open yet. */
  closedEmirate?: string;
}

/**
 * The results page. Every change of text or filter replaces the address, and the server renders
 * the first page for it again (so a shared or reloaded link shows the same search); the list then
 * fetches further pages itself.
 */
export function SearchScreen({ state, initial, closedEmirate }: SearchScreenProps) {
  const t = useTranslations('search');
  const router = useRouter();
  const pathname = usePathname();
  const { location, updating } = useSearchLocation();
  const describe = useDescribe();
  const { MapView } = useMaps();
  const [picking, setPicking] = useState(false);
  const [pending, startTransition] = useTransition();

  const go = (next: SearchState) =>
    startTransition(() =>
      router.replace(`${pathname}${searchQueryString(next)}`, { scroll: false }),
    );

  const place = location ? describe(location) : undefined;
  const point = location ? { lat: location.lat, lng: location.lng } : undefined;
  // A new search, or the same one from another place, starts the list again.
  const listKey = `${searchQueryString({ ...state, view: 'list' })}@${point?.lat},${point?.lng}`;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-2 pb-10">
      <SearchBar
        key={state.q}
        label={t('label')}
        placeholder={t('label')}
        defaultValue={state.q}
        action={pathname}
        onSearch={(q) => go({ ...state, q })}
        locationText={place}
        locationLabel={place ? t('locationButton', { place }) : undefined}
        onLocationClick={() => setPicking(true)}
      />
      <LocationPicker open={picking} onClose={() => setPicking(false)} />

      {!location ? (
        <EmptyState
          icon="current-location"
          title={t('noLocationTitle')}
          body={t('noLocationBody')}
          action={
            <Button variant="primary" onClick={() => setPicking(true)}>
              {t('setLocation')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="min-w-0 text-xl font-bold">
              {state.q ? t('titleQuery', { q: state.q }) : t('titleNear', { place: place ?? '' })}
            </h1>
            {mapsConfigured && (
              <Tabs
                variant="segmented"
                label={t('views')}
                value={state.view}
                onChange={(id) => go({ ...state, view: id === 'map' ? 'map' : 'list' })}
                items={[
                  { id: 'list', label: t('list'), icon: 'list' },
                  { id: 'map', label: t('map'), icon: 'map' },
                ]}
              />
            )}
          </div>
          <SearchFilters state={state} onChange={go} />

          <div className={pending || updating ? 'opacity-60 transition-opacity' : undefined}>
            {state.view === 'map' && mapsConfigured ? (
              MapView ? (
                <SearchMap
                  key={listKey}
                  state={state}
                  point={point!}
                  you={location.source === 'gps' ? point : undefined}
                  listed={initial?.items ?? []}
                />
              ) : (
                <Skeleton variant="block" height="60dvh" />
              )
            ) : (
              <SearchResults
                key={listKey}
                initial={initial ?? null}
                state={state}
                point={point!}
                onChange={go}
                closedEmirate={closedEmirate}
                pending={pending || updating}
                onRetry={() => startTransition(() => router.refresh())}
              />
            )}
          </div>
        </>
      )}
    </main>
  );
}
