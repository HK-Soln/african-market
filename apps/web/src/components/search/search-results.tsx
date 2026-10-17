'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, EmptyState, Skeleton } from '@am/ui';
import { browserApi } from '@/lib/browser-api';
import { hasFilters, nearbyQuery, widerRadius, type SearchState } from '@/lib/search/params';
import { PAGE_SIZE, type NearbyBranch, type NearbyPage } from '@/lib/search/server';
import { ResultCard } from './result-card';

export interface SearchResultsProps {
  /** The first page, from the server. Null: search could not be reached. */
  initial: NearbyPage | null;
  state: SearchState;
  point: { lat: number; lng: number };
  onChange: (next: SearchState) => void;
  /** The emirate searched in, when search is not open there yet. */
  closedEmirate?: string;
  /** Shown while the server renders a new search. */
  pending?: boolean;
  onRetry: () => void;
}

/**
 * The results as a list. Later pages are fetched by cursor as the end comes into view; a button
 * does the same for keyboards and screen readers. A new search (other filters, place or text)
 * remounts this list (its `key`), so pages of different searches never mix.
 */
export function SearchResults({
  initial,
  state,
  point,
  onChange,
  closedEmirate,
  pending,
  onRetry,
}: SearchResultsProps) {
  const t = useTranslations('search');
  const [items, setItems] = useState<NearbyBranch[]>(initial?.items ?? []);
  const [cursor, setCursor] = useState(initial?.nextCursor ?? null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const { data } = await browserApi.GET('/api/v1/search/nearby', {
        params: { query: { ...nearbyQuery(state, point), limit: PAGE_SIZE, cursor } },
      });
      if (!data) throw new Error('search failed');
      // A branch is never shown twice, even if ranking moved it between pages.
      setItems((shown) => {
        const seen = new Set(shown.map((i) => i.branchId));
        return [...shown, ...data.items.filter((i) => !seen.has(i.branchId))];
      });
      setCursor(data.nextCursor);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, state, point]);

  useEffect(() => {
    const target = end.current;
    if (!target || !cursor || failed) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [cursor, failed, loadMore]);

  if (!initial) {
    return (
      <EmptyState
        icon="wifi-off"
        tone="danger"
        title={t('errorTitle')}
        body={t('errorBody')}
        action={
          <Button variant="primary" onClick={onRetry}>
            {t('retry')}
          </Button>
        }
      />
    );
  }

  if (items.length === 0)
    return <NoResults state={state} onChange={onChange} closedEmirate={closedEmirate} />;

  return (
    <div className="flex flex-col gap-3" aria-busy={pending || loading}>
      <p className="text-sm text-ink-muted" aria-live="polite">
        {t('showing', { count: items.length })}
      </p>
      <ol className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.branchId}>
            <ResultCard item={item} />
          </li>
        ))}
      </ol>
      <div ref={end} className="flex flex-col items-center gap-2 py-2">
        {loading && <Skeleton variant="shop-card" />}
        {failed && (
          <p role="alert" className="text-sm text-danger">
            {t('loadFailed')}
          </p>
        )}
        {cursor ? (
          <Button
            variant="secondary"
            loading={loading}
            loadingLabel={t('loading')}
            onClick={loadMore}
          >
            {failed ? t('retry') : t('loadMore')}
          </Button>
        ) : (
          <p className="text-sm text-ink-muted">{t('end')}</p>
        )}
      </div>
    </div>
  );
}

/** Nothing found: say why in plain words, and offer the change most likely to find shops. */
function NoResults({
  state,
  onChange,
  closedEmirate,
}: {
  state: SearchState;
  onChange: (next: SearchState) => void;
  closedEmirate?: string;
}) {
  const t = useTranslations('search');
  if (closedEmirate) {
    return (
      <EmptyState
        icon="map-pin"
        title={t('closedTitle', { emirate: closedEmirate })}
        body={t('closedBody')}
      />
    );
  }
  const clear = hasFilters(state) ? (
    <Button
      variant="secondary"
      onClick={() =>
        onChange({
          ...state,
          categoryId: undefined,
          origin: undefined,
          openNow: false,
          deliversToMe: false,
        })
      }
    >
      {t('clearFilters')}
    </Button>
  ) : undefined;

  if (state.mode === 'delivery') {
    return (
      <EmptyState
        icon="truck"
        title={t('deliveryNoneTitle')}
        body={t('deliveryNoneBody')}
        action={
          <Button variant="primary" onClick={() => onChange({ ...state, mode: 'pickup' })}>
            {t('tryPickup')}
          </Button>
        }
        secondaryAction={clear}
      />
    );
  }

  const wider = widerRadius(state.radiusKm);
  return (
    <EmptyState
      icon="map-pin"
      title={
        hasFilters(state) && !wider
          ? t('filteredNoneTitle')
          : t('noneTitle', { km: state.radiusKm })
      }
      body={t('noneBody')}
      action={
        wider ? (
          <Button variant="primary" onClick={() => onChange({ ...state, radiusKm: wider })}>
            {t('widen', { km: wider })}
          </Button>
        ) : undefined
      }
      secondaryAction={clear}
    />
  );
}
