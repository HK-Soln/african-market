'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge, Button, Card, EmptyState, Skeleton, type BadgeTone } from '@am/ui';
import { Link } from '@/i18n/navigation';
import { nextStep, SETUP_STEPS, setupProgress, shopsApi, type SellerShop } from '@/lib/shops';

/** How each listing status looks: always a word, never colour alone. */
export const STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  pending: 'pending',
  verified: 'verified',
  rejected: 'rejected',
  suspended: 'danger',
};

/** The seller's home: their shops with where each stands, or the way to create the first. */
export function MyShops() {
  const t = useTranslations('shops');
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; shops: SellerShop[] } | { status: 'error' }
  >({ status: 'loading' });

  const load = async () => {
    setState({ status: 'loading' });
    const result = await shopsApi.listMine();
    setState(result.ok ? { status: 'ready', shops: result.data.items } : { status: 'error' });
  };
  useEffect(() => {
    void load();
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        <Skeleton variant="block" height={96} />
        <Skeleton variant="block" height={96} />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <EmptyState
        icon="wifi-off"
        tone="danger"
        title={t('loadFailed')}
        action={
          <Button variant="primary" onClick={load}>
            {t('retry')}
          </Button>
        }
      />
    );
  }
  if (state.shops.length === 0) {
    return (
      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-xl font-bold">{t('welcomeTitle')}</h2>
        <p className="text-ink-muted">{t('welcomeBody')}</p>
        <Link href="/shops/new" className="am-btn am-btn-primary self-start">
          {t('create')}
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {state.shops.map((shop) => {
          const progress = setupProgress(shop);
          const done = SETUP_STEPS.filter((s) => progress[s]).length;
          const step = nextStep(shop);
          return (
            <li key={shop.id}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="truncate text-lg font-semibold">{shop.name}</h2>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                    <Badge tone={STATUS_TONE[shop.verificationStatus] ?? 'neutral'}>
                      {t(`status${shop.verificationStatus}`)}
                    </Badge>
                    {step && <span>{t('progress', { done, total: SETUP_STEPS.length })}</span>}
                  </div>
                </div>
                {step ? (
                  <Link
                    href={{ pathname: `/shops/${shop.id}/setup`, query: { step } }}
                    className="am-btn am-btn-primary"
                  >
                    {t('continueSetup')}
                  </Link>
                ) : (
                  <Link href={`/shops/${shop.id}`} className="am-btn am-btn-secondary">
                    {t('open')}
                  </Link>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      <Link href="/shops/new" className="am-btn am-btn-ghost self-start">
        {t('addAnother')}
      </Link>
    </div>
  );
}
