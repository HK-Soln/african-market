'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Button, Card, EmptyState, Icon, Input, Skeleton, Tabs } from '@am/ui';
import { Link } from '@/i18n/navigation';
import { QUEUE_VIEWS, queueQuery, type AdminShop, type QueueView } from '@/lib/review';
import { shopsApi } from '@/lib/shops';
import { useDebounced } from '@/lib/use-debounced';
import { useErrorText } from '../error-text';
import { KycBadge, ListingBadge } from './status';

/**
 * Shops sent for listing, oldest first, and every other shop by status or name: an admin finds a
 * shop here to review it, or to suspend one that is live.
 */
export function ShopQueue() {
  const t = useTranslations('shops');
  const format = useFormatter();
  const errorText = useErrorText();
  const [view, setView] = useState<QueueView>('pending');
  const [query, setQuery] = useState('');
  const search = useDebounced(query, 250);
  const [shops, setShops] = useState<AdminShop[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (cursor?: string) => {
      const result = await shopsApi.queue(queueQuery(view, search, cursor));
      if (!result.ok) return setError(result.code);
      setError(null);
      setShops((before) =>
        cursor ? [...(before ?? []), ...result.data.items] : result.data.items,
      );
      setNextCursor(result.data.nextCursor);
    },
    [view, search],
  );

  useEffect(() => {
    setShops(null);
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-ink-muted">{t('intro')}</p>
      </header>

      <div className="flex flex-col gap-3">
        <Tabs
          variant="segmented"
          label={t('view')}
          items={QUEUE_VIEWS.map((v) => ({ id: v, label: t(`views.${v}`) }))}
          value={view}
          onChange={(id) => setView(id as QueueView)}
          className="self-start max-w-full overflow-x-auto"
        />
        <Input
          type="search"
          label={t('search')}
          iconStart="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error ? (
        <EmptyState
          icon="alert-triangle"
          tone="danger"
          title={errorText(error)}
          action={<Button onClick={() => void load()}>{t('retry')}</Button>}
        />
      ) : !shops ? (
        <div className="flex flex-col gap-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="block" height={88} />
          ))}
        </div>
      ) : shops.length === 0 ? (
        <EmptyState
          icon={view === 'pending' && !search ? 'circle-check' : 'search'}
          title={view === 'pending' && !search ? t('queueEmpty') : t('none')}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {shops.map((shop) => (
              <li key={shop.id}>
                <Link href={`/shops/${shop.id}`} className="block">
                  <Card className="flex items-center gap-3 p-4">
                    <span className="flex min-w-0 grow flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold">{shop.name}</span>
                        <ListingBadge status={shop.verificationStatus} />
                        <KycBadge status={shop.kycStatus} />
                      </span>
                      <span className="text-[13px] text-ink-muted">
                        {shop.submittedAt
                          ? t('submittedAt', {
                              when: format.dateTime(new Date(shop.submittedAt), {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                                timeZone: 'Asia/Dubai',
                              }),
                            })
                          : shop.slug}
                        {' · '}
                        {t('branchCount', { n: shop.branches.length })}
                      </span>
                    </span>
                    <Icon name="chevron-right" className="shrink-0 text-ink-muted" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
          {nextCursor && (
            <Button
              variant="secondary"
              className="self-center"
              loading={loadingMore}
              loadingLabel={t('loading')}
              onClick={async () => {
                setLoadingMore(true);
                await load(nextCursor);
                setLoadingMore(false);
              }}
            >
              {t('loadMore')}
            </Button>
          )}
        </>
      )}
    </main>
  );
}
