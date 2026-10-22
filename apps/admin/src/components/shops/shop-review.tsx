'use client';

import { useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { Button, Card, EmptyState, Skeleton, Toast } from '@am/ui';
import { Link } from '@/i18n/navigation';
import { config } from '@/lib/config';
import {
  dubaiToday,
  listingActions,
  needsReason,
  type ListingDecision,
  type VerificationOverview,
} from '@/lib/review';
import { shopsApi } from '@/lib/shops';
import { useErrorText } from '../error-text';
import { DecisionDialog } from './decision-dialog';
import { BranchesSection, ProfileSection } from './shop-profile';
import { KycBadge, ListingBadge } from './status';
import { HistorySection, IdentitySection, LicenseSection } from './verification-sections';

/**
 * One shop, everything an admin needs to decide on its listing: the identity check and its
 * images, the trade licence, the page customers would see, the branches and the history. The
 * decisions follow the listing rules; approving needs the identity check passed.
 */
export function ShopReview({ shopId }: { shopId: string }) {
  const t = useTranslations('review');
  const locale = useLocale();
  const format = useFormatter();
  const errorText = useErrorText();
  const [overview, setOverview] = useState<VerificationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<ListingDecision | null>(null);
  const [done, setDone] = useState<ListingDecision | null>(null);
  const today = dubaiToday();

  useEffect(() => {
    void shopsApi.verification(shopId).then((result) => {
      if (result.ok) setOverview(result.data);
      else setError(result.code);
    });
  }, [shopId]);

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <EmptyState
          icon="building-store"
          tone="danger"
          title={errorText(error)}
          action={<Link href="/shops">{t('back')}</Link>}
        />
      </main>
    );
  }
  if (!overview) {
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8" aria-busy>
        <Skeleton width="40%" height={32} />
        <Skeleton variant="block" height={160} />
        <Skeleton variant="block" height={320} />
      </main>
    );
  }

  const { shop } = overview;
  const actions = listingActions(shop.verificationStatus);
  const blockedApproval = shop.kycStatus !== 'passed';

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <Link href="/shops" className="self-start text-sm font-semibold text-clay-ink">
          {t('back')}
        </Link>
        <h1 className="text-2xl font-bold">{shop.name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ListingBadge status={shop.verificationStatus} />
          <KycBadge status={shop.kycStatus} />
          {shop.submittedAt && (
            <span className="text-sm text-ink-muted">
              {t('submittedAt', {
                when: format.dateTime(new Date(shop.submittedAt), {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: 'Asia/Dubai',
                }),
              })}
            </span>
          )}
        </div>
        {shop.verificationReason && (
          <p className="text-sm">
            <span className="text-ink-muted">{t('reason')}: </span>
            {shop.verificationReason}
          </p>
        )}
        {shop.verificationStatus === 'verified' && (
          <a
            href={`${config.webUrl}/${locale}/s/${shop.slug}`}
            target="_blank"
            rel="noopener"
            className="self-start text-sm font-semibold text-clay-ink"
          >
            {t('viewPublic')}
          </a>
        )}
      </header>

      {actions.length > 0 && (
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="font-semibold">{t('decision.title')}</h2>
          {actions.includes('approve') && blockedApproval && (
            <p className="text-sm text-ink-muted">{t('decision.kycFirst')}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action}
                variant={
                  action === 'approve' || action === 'reinstate'
                    ? 'primary'
                    : action === 'suspend'
                      ? 'destructive'
                      : 'secondary'
                }
                disabled={action === 'approve' && blockedApproval}
                onClick={() => setDeciding(action)}
              >
                {t(`decision.${action}`)}
              </Button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <IdentitySection overview={overview} today={today} />
        <LicenseSection overview={overview} today={today} onChange={setOverview} />
      </div>
      <ProfileSection shop={shop} />
      <BranchesSection shop={shop} />
      <HistorySection requests={overview.requests} />

      <DecisionDialog
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={deciding ? t(`decision.${deciding}Title`) : ''}
        body={deciding ? t(`decision.${deciding}Body`) : ''}
        confirm={deciding ? t(`decision.${deciding}`) : ''}
        reason={deciding ? needsReason(deciding) : false}
        danger={deciding === 'reject' || deciding === 'suspend'}
        onConfirm={async (reason) => {
          const decision = deciding!;
          const result = await shopsApi.decideListing(shop.id, decision, reason);
          if (result.ok) {
            setOverview(result.data);
            setDone(decision);
          }
          return result;
        }}
      />
      {done && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md">
          <Toast
            tone="success"
            title={t(`decision.${done}Done`)}
            onClose={() => setDone(null)}
            closeLabel={t('close')}
          />
        </div>
      )}
    </main>
  );
}
