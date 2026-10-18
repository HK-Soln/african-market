'use client';

import { useTranslations } from 'next-intl';
import { Badge, Card, EmptyState, Icon, Skeleton } from '@am/ui';
import { Link } from '@/i18n/navigation';
import { useSellerShop } from '@/lib/shops';

/** A shop's branches, each with how it serves customers, and the way to add another. */
export function BranchList({ shopId }: { shopId: string }) {
  const t = useTranslations('branches');
  const s = useTranslations('setup');
  const e = useTranslations('emirates');
  const { state } = useSellerShop(shopId);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton variant="block" height={88} />
        <Skeleton variant="block" height={88} />
      </div>
    );
  }
  if (state.status === 'error') return <EmptyState icon="building-store" title={s('notFound')} />;

  const shop = state.shop;
  return (
    <div className="flex flex-col gap-6">
      <Link href={`/shops/${shop.id}`} className="self-start text-sm font-semibold text-clay-ink">
        {shop.name}
      </Link>
      <h1 className="text-[26px] leading-8 font-bold">{t('title')}</h1>
      <ul className="flex flex-col gap-3">
        {shop.branches.map((b) => {
          const serves = [
            b.pickup ? t('servesPickup') : null,
            b.delivery
              ? b.serviceArea
                ? t('servesArea')
                : t('servesRadius', { km: Math.round((b.serviceRadiusM ?? 0) / 1000) })
              : null,
          ].filter(Boolean);
          return (
            <li key={b.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="flex flex-wrap items-center gap-2 font-semibold">
                    {b.name}
                    {b.isPrimary && (
                      <Badge tone="neutral" icon={false}>
                        {t('main')}
                      </Badge>
                    )}
                  </h2>
                  <p className="flex items-center gap-1 text-sm text-ink-muted">
                    <Icon name="map-pin" size={16} />
                    {[b.area, e(b.emirate)].filter(Boolean).join(', ')}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {serves.join(' · ')}
                    {b.openingHours.length === 0 && ` · ${t('noHours')}`}
                  </p>
                </div>
                <Link
                  href={`/shops/${shop.id}/branches/${b.id}`}
                  className="am-btn am-btn-secondary"
                >
                  {t('edit')}
                </Link>
              </Card>
            </li>
          );
        })}
      </ul>
      <Link href={`/shops/${shop.id}/branches/new`} className="am-btn am-btn-primary self-start">
        {t('add')}
      </Link>
    </div>
  );
}
