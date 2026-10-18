'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { pickLocalized, type Locale } from '@am/i18n';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  formatAED,
  Input,
  Skeleton,
  Tabs,
  type BadgeTone,
} from '@am/ui';
import { Link } from '@/i18n/navigation';
import { priceRange, type SellerProduct } from '@/lib/product-form';
import { productsApi } from '@/lib/products';
import { useSellerShop } from '@/lib/shops';
import { useErrorText } from '../error-text';

export const PRODUCT_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  pending_review: 'pending',
  active: 'success',
  hidden: 'neutral',
  rejected: 'rejected',
};

const FILTERS = ['all', 'active', 'pending_review', 'draft', 'hidden', 'rejected'] as const;

/** A price or a range in dirhams; "On request" for a service without one. */
export function usePriceText() {
  const t = useTranslations('products');
  return (variants: Array<{ priceFils: number | null }>) => {
    const range = priceRange(variants);
    if (!range) return t('onRequest');
    return range.min === range.max
      ? formatAED(range.min / 100)
      : t('priceRange', { min: formatAED(range.min / 100), max: formatAED(range.max / 100) });
  };
}

/** The shop's catalogue: every product with its status and where it is sold, a page at a time. */
export function ProductList({ shopId }: { shopId: string }) {
  const t = useTranslations('products');
  const s = useTranslations('setup');
  const locale = useLocale() as Locale;
  const errorText = useErrorText();
  const priceText = usePriceText();
  const { state: shopState } = useSellerShop(shopId);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<SellerProduct[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (after?: string) => {
      const result = await productsApi.list(shopId, {
        status: filter === 'all' ? undefined : filter,
        search: query || undefined,
        cursor: after,
      });
      if (!result.ok) return setError(result.code);
      setError(null);
      setItems((before) => (after ? [...(before ?? []), ...result.data.items] : result.data.items));
      setCursor(result.data.nextCursor);
    },
    [shopId, filter, query],
  );

  useEffect(() => {
    setItems(null);
    void load();
  }, [load]);

  if (shopState.status === 'error')
    return <EmptyState icon="building-store" title={s('notFound')} />;
  const shop = shopState.status === 'ready' ? shopState.shop : null;
  const branchName = (id: string) => shop?.branches.find((b) => b.id === id)?.name;

  return (
    <div className="flex flex-col gap-6">
      {shop && (
        <Link href={`/shops/${shop.id}`} className="self-start text-sm font-semibold text-clay-ink">
          {shop.name}
        </Link>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] leading-8 font-bold">{t('title')}</h1>
        <Link href={`/shops/${shopId}/products/new`} className="am-btn am-btn-primary">
          {t('add')}
        </Link>
      </div>
      {shop && shop.verificationStatus !== 'verified' && (
        <p className="rounded-md bg-surface-sunken p-3 text-sm text-ink-muted">
          {t('notVerifiedHint')}
        </p>
      )}

      <form
        role="search"
        onSubmit={(ev) => {
          ev.preventDefault();
          setQuery(search.trim());
        }}
      >
        <Input
          label={t('search')}
          type="search"
          iconStart="search"
          value={search}
          onChange={(ev) => {
            setSearch(ev.target.value);
            if (!ev.target.value) setQuery('');
          }}
        />
      </form>
      <div className="-mx-4 overflow-x-auto px-4">
        <Tabs
          label={t('filterLabel')}
          items={FILTERS.map((f) => ({ id: f, label: t(`filter${f}`) }))}
          value={filter}
          onChange={(id) => setFilter(id as (typeof FILTERS)[number])}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {errorText(error)}
        </p>
      )}
      {items === null ? (
        <div className="flex flex-col gap-3" aria-busy>
          <Skeleton variant="block" height={88} />
          <Skeleton variant="block" height={88} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="package"
          title={filter === 'all' && !query ? t('emptyTitle') : t('noneHere')}
          body={filter === 'all' && !query ? t('emptyHint') : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((p) => {
            const image = p.imageMediaIds.map((id) => p.imageUrls[id]).find(Boolean);
            const branches = [...new Set(p.listings.map((l) => l.branchId))];
            const outOfStock = p.listings.length > 0 && p.listings.every((l) => !l.inStock);
            return (
              <li key={p.id}>
                <Link href={`/shops/${shopId}/products/${p.id}`} className="block">
                  <Card className="flex items-center gap-3 p-3">
                    <span
                      className="am-media am-media-empty shrink-0 rounded-md"
                      style={{ width: 64, height: 64 }}
                      aria-hidden
                    >
                      {image && <img src={image.thumb ?? image.card} alt="" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate font-semibold">
                        {pickLocalized(p.title, locale) || t('untitled')}
                      </span>
                      <span className="text-sm text-ink-muted">
                        {priceText(p.variants)}
                        {p.variants.length > 1 &&
                          ` · ${t('variantCount', { n: p.variants.length })}`}
                      </span>
                      <span className="truncate text-sm text-ink-muted">
                        {branches.length === 0
                          ? t('notSold')
                          : shop && branches.length === shop.branches.length && branches.length > 1
                            ? t('soldEverywhere')
                            : branches.map(branchName).filter(Boolean).join(', ')}
                        {outOfStock && ` · ${t('outOfStock')}`}
                      </span>
                    </span>
                    <Badge tone={PRODUCT_TONE[p.status] ?? 'neutral'} icon={false}>
                      {t(`status${p.status}`)}
                    </Badge>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {cursor && (
        <Button
          className="self-center"
          loading={loadingMore}
          loadingLabel={t('loading')}
          onClick={async () => {
            setLoadingMore(true);
            await load(cursor);
            setLoadingMore(false);
          }}
        >
          {t('more')}
        </Button>
      )}
    </div>
  );
}
