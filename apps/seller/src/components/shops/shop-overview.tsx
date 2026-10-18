'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Badge, Card, EmptyState, Icon, Skeleton } from '@am/ui';
import { Link } from '@/i18n/navigation';
import { config } from '@/lib/config';
import { SETUP_STEPS, setupProgress, useSellerShop } from '@/lib/shops';
import { STATUS_TONE } from './my-shops';

/**
 * A shop's dashboard: where it stands, what onboarding still needs (each step links to its
 * form), and its branches. Photos, verification, catalogue and analytics join in the next parts.
 */
export function ShopOverview({ shopId }: { shopId: string }) {
  const t = useTranslations('overview');
  const s = useTranslations('setup');
  const shops = useTranslations('shops');
  const e = useTranslations('emirates');
  const locale = useLocale();
  const { state } = useSellerShop(shopId);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton width="50%" height={32} />
        <Skeleton variant="block" height={200} />
      </div>
    );
  }
  if (state.status === 'error') {
    return <EmptyState icon="building-store" title={s('notFound')} />;
  }

  const shop = state.shop;
  const progress = setupProgress(shop);
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-[26px] leading-8 font-bold">{shop.name}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={STATUS_TONE[shop.verificationStatus] ?? 'neutral'}>
            {shops(`status${shop.verificationStatus}`)}
          </Badge>
          {shop.verificationStatus === 'verified' && (
            <a
              href={`${config.webUrl}/${locale}/s/${shop.slug}`}
              target="_blank"
              rel="noopener"
              className="text-sm font-semibold text-clay-ink"
            >
              {t('viewPublic')}
            </a>
          )}
        </div>
      </header>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-lg font-semibold">{t('checklist')}</h2>
        <ol className="flex flex-col divide-y divide-line">
          {SETUP_STEPS.map((step) => (
            <li key={step} className="flex items-center justify-between gap-3 py-2">
              <span className="flex items-center gap-2">
                <Icon
                  name={progress[step] ? 'circle-check' : 'clock'}
                  className={progress[step] ? 'text-success' : 'text-ink-muted'}
                />
                {s(`step${step}`)}
                {!progress[step] && <span className="text-sm text-ink-muted">· {t('todo')}</span>}
              </span>
              <Link
                href={{ pathname: `/shops/${shop.id}/setup`, query: { step } }}
                className="text-sm font-semibold text-clay-ink"
              >
                {t('edit')}
              </Link>
            </li>
          ))}
          {(['photos', 'verify'] as const).map((step) => (
            <li key={step} className="flex items-center justify-between gap-3 py-2 text-ink-muted">
              <span className="flex items-center gap-2">
                <Icon name="clock" />
                {s(`step${step}`)}
              </span>
              <span className="text-sm">{s('comingSoon')}</span>
            </li>
          ))}
        </ol>
      </Card>

      {shop.branches.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t('branches')}</h2>
          <ul className="flex flex-col gap-2">
            {shop.branches.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-sm">
                <Icon name="map-pin" size={16} className="text-clay" />
                <span className="font-semibold">{b.name}</span>
                <span className="text-ink-muted">
                  {[b.area, e(b.emirate)].filter(Boolean).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
