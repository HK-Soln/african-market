'use client';

import { useTranslations } from 'next-intl';
import { EmptyState, Skeleton } from '@am/ui';
import { Link } from '@/i18n/navigation';
import { useSellerShop } from '@/lib/shops';
import { SetupFrame } from '../setup/setup-frame';
import { VerificationPanel } from './verification-panel';

/** The verification step on its own address, where the identity provider returns the owner. */
export function ShopVerification({ shopId, returning }: { shopId: string; returning: boolean }) {
  const t = useTranslations('setup');
  const { state, setShop } = useSellerShop(shopId);
  if (state.status === 'loading') {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6" aria-busy>
        <Skeleton width="60%" height={32} />
        <Skeleton variant="block" height={240} />
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <EmptyState icon="building-store" title={t('notFound')} />
      </main>
    );
  }
  return (
    <SetupFrame step="verify" title={t('verifyTitle')} intro={t('verifyIntro')}>
      <Link href={`/shops/${shopId}`} className="self-start text-sm font-semibold text-clay-ink">
        {state.shop.name}
      </Link>
      <VerificationPanel shop={state.shop} returning={returning} onChange={setShop} />
    </SetupFrame>
  );
}
