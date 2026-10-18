'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { pickLocalized, type Locale } from '@am/i18n';
import { BarChart, EmptyState, Skeleton, StatCard, Tabs } from '@am/ui';
import { Link } from '@/i18n/navigation';
import { contactColumns, PERIODS, share, type ContactStats, type Period } from '@/lib/insights';
import type { SellerProduct } from '@/lib/product-form';
import { productsApi } from '@/lib/products';
import { shopsApi, useSellerShop } from '@/lib/shops';
import { useErrorText } from '../error-text';

const CHANNELS = [
  { key: 'whatsapp', color: 'var(--color-chart-1)', icon: 'brand-whatsapp' },
  { key: 'call', color: 'var(--color-chart-2)', icon: 'phone' },
  { key: 'email', color: 'var(--color-chart-3)', icon: 'mail' },
] as const;

/**
 * How often customers tapped WhatsApp, call or email on the shop's pages: totals, a chart by day
 * (by week over 90 days, Dubai days) and the products that brought the most.
 */
export function ContactInsights({ shopId }: { shopId: string }) {
  const t = useTranslations('insights');
  const s = useTranslations('setup');
  const locale = useLocale() as Locale;
  const errorText = useErrorText();
  const { state: shopState } = useSellerShop(shopId);
  const [period, setPeriod] = useState<Period>(30);
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titles, setTitles] = useState<Map<string, SellerProduct>>(new Map());

  useEffect(() => {
    let live = true;
    setStats(null);
    void shopsApi.contactStats(shopId, period).then((result) => {
      if (!live) return;
      if (result.ok) {
        setStats(result.data);
        setError(null);
      } else setError(result.code);
    });
    return () => {
      live = false;
    };
  }, [shopId, period]);

  // Names for the top products: one page of the shop's newest products covers most shops.
  useEffect(() => {
    void productsApi.list(shopId).then((result) => {
      if (result.ok) setTitles(new Map(result.data.items.map((p) => [p.id, p])));
    });
  }, [shopId]);

  if (shopState.status === 'error')
    return <EmptyState icon="building-store" title={s('notFound')} />;
  const shop = shopState.status === 'ready' ? shopState.shop : null;

  return (
    <div className="flex flex-col gap-6">
      {shop && (
        <Link href={`/shops/${shop.id}`} className="self-start text-sm font-semibold text-clay-ink">
          {shop.name}
        </Link>
      )}
      <div className="flex flex-col gap-1">
        <h1 className="text-[26px] leading-8 font-bold">{t('title')}</h1>
        <p className="text-sm text-ink-muted">{t('intro')}</p>
      </div>
      <Tabs
        variant="segmented"
        label={t('period')}
        items={PERIODS.map((p) => ({ id: String(p), label: t('lastDays', { days: p }) }))}
        value={String(period)}
        onChange={(id) => setPeriod(Number(id) as Period)}
        className="self-start"
      />

      {error ? (
        <EmptyState icon="alert-triangle" tone="danger" title={errorText(error)} />
      ) : !stats ? (
        <div className="flex flex-col gap-3" aria-busy>
          <Skeleton variant="block" height={96} />
          <Skeleton variant="block" height={220} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t('total')} value={stats.total} icon="trending-up" />
            {CHANNELS.map((c) => (
              <StatCard
                key={c.key}
                label={t(c.key)}
                value={stats.byChannel[c.key]}
                icon={c.icon}
                delta={
                  stats.total
                    ? t('shareOf', { percent: share(stats.byChannel[c.key], stats.total) })
                    : undefined
                }
              />
            ))}
          </div>

          {stats.total === 0 ? (
            <EmptyState icon="message-circle" title={t('noneTitle')} body={t('noneBody')} />
          ) : (
            <>
              <BarChart
                title={period === 90 ? t('byWeek') : t('byDay')}
                series={CHANNELS.map((c) => ({ key: c.key, label: t(c.key), color: c.color }))}
                columns={contactColumns(stats.byDay, period, locale)}
              />
              {stats.byProduct.length > 0 && (
                <section className="flex flex-col gap-3" aria-labelledby="top-products">
                  <h2 id="top-products" className="text-lg font-semibold">
                    {t('topProducts')}
                  </h2>
                  <ol className="flex flex-col divide-y divide-line rounded-lg border border-line">
                    {stats.byProduct.map((p, i) => {
                      const product = titles.get(p.productId);
                      const name = product ? pickLocalized(product.title, locale) : null;
                      return (
                        <li key={p.productId} className="flex items-center gap-3 p-3">
                          <span className="w-6 text-sm text-ink-muted">{i + 1}</span>
                          <span className="min-w-0 flex-1 truncate">
                            {product ? (
                              <Link
                                href={`/shops/${shopId}/products/${p.productId}`}
                                className="font-semibold"
                              >
                                {name || t('untitled')}
                              </Link>
                            ) : (
                              <span className="text-ink-muted">{t('otherProduct')}</span>
                            )}
                          </span>
                          <span className="font-semibold tabular-nums">
                            {t('taps', { n: p.count })}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}
            </>
          )}
          <p className="text-xs text-ink-muted">{t('footnote')}</p>
        </>
      )}
    </div>
  );
}
