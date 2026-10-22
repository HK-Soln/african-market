'use client';

import { useTranslations } from 'next-intl';
import { Badge, type BadgeTone } from '@am/ui';

const LISTING_TONE: Record<string, BadgeTone> = {
  draft: 'neutral',
  pending: 'pending',
  verified: 'verified',
  rejected: 'rejected',
  suspended: 'danger',
};

/** Where a shop's listing stands, in words. */
export function ListingBadge({ status }: { status: string }) {
  const t = useTranslations('shops.listing');
  return <Badge tone={LISTING_TONE[status] ?? 'neutral'}>{t(status)}</Badge>;
}

const KYC_TONE: Record<string, BadgeTone> = {
  none: 'neutral',
  pending: 'pending',
  passed: 'success',
  failed: 'danger',
};

/** The owner's identity check, in words. */
export function KycBadge({ status }: { status: string }) {
  const t = useTranslations('shops.kyc');
  return <Badge tone={KYC_TONE[status] ?? 'neutral'}>{t(status)}</Badge>;
}

const REQUEST_TONE: Record<string, BadgeTone> = {
  started: 'neutral',
  pending: 'pending',
  approved: 'success',
  rejected: 'rejected',
  expired: 'neutral',
};

/** One verification request (identity check or licence), in words. */
export function RequestBadge({ status }: { status: string }) {
  const t = useTranslations('shops.request');
  return <Badge tone={REQUEST_TONE[status] ?? 'neutral'}>{t(status)}</Badge>;
}
