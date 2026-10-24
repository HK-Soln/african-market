'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  REPORT_DETAILS_MAX,
  REPORT_OTHER_MIN,
  REPORT_REASONS,
  type ReportReason,
} from '@am/contracts';
import { Button, Card, EmptyState, LinkButton, Radio, Textarea } from '@am/ui';
import { useSession } from '@/components/session-provider';
import { Link } from '@/i18n/navigation';
import { browserApi } from '@/lib/browser-api';
import { visitorId } from '@/lib/contact';

export type ReportedListing =
  | { kind: 'shop'; id: string; name: string; href: string }
  | { kind: 'product'; id: string; name: string; shopName: string; href: string };

type Problem = 'reason' | 'details' | 'tooMany' | 'gone' | 'failed';

/**
 * Why the listing is wrong, as a reason and a few words. Signing in is not needed; a report sent
 * while signed in carries the account, and the seller never learns who sent it.
 */
export function ReportForm({ listing }: { listing: ReportedListing }) {
  const t = useTranslations('report');
  const locale = useLocale();
  const session = useSession();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [sent, setSent] = useState(false);

  if (sent)
    return (
      <EmptyState
        icon="circle-check"
        title={t('sentTitle')}
        body={t('sentBody')}
        action={
          <LinkButton href={`/${locale}${listing.href}`} variant="secondary">
            {t('back')}
          </LinkButton>
        }
      />
    );

  const submit = async () => {
    if (!reason) return setProblem('reason');
    const text = details.trim();
    if (reason === 'other' && text.length < REPORT_OTHER_MIN) return setProblem('details');
    setBusy(true);
    setProblem(null);
    const response = await browserApi
      .POST('/api/v1/reports', {
        body: {
          ...(listing.kind === 'shop' ? { shopId: listing.id } : { productId: listing.id }),
          reason,
          ...(text ? { details: text } : {}),
          sessionId: visitorId(),
        },
      })
      .then((r) => r.response)
      .catch(() => undefined);
    setBusy(false);
    if (response?.ok) return setSent(true);
    setProblem(response?.status === 429 ? 'tooMany' : response?.status === 404 ? 'gone' : 'failed');
  };

  return (
    <form
      className="flex flex-col gap-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">
          {listing.kind === 'shop' ? t('titleShop') : t('titleProduct')}
        </h1>
        <Card className="flex flex-col gap-1 p-4">
          <Link href={listing.href} className="font-semibold text-clay-ink">
            {listing.name}
          </Link>
          {listing.kind === 'product' && (
            <span className="text-sm text-ink-muted">
              {t('soldBy', { shop: listing.shopName })}
            </span>
          )}
        </Card>
        <p className="text-ink-muted">{t('intro')}</p>
      </header>

      <fieldset
        className="flex flex-col gap-1"
        aria-describedby={problem === 'reason' ? 'report-reason-error' : undefined}
      >
        <legend className="mb-2 font-semibold">{t('reasonLabel')}</legend>
        {REPORT_REASONS.map((value) => (
          <Radio
            key={value}
            name="reason"
            value={value}
            checked={reason === value}
            onChange={() => {
              setReason(value);
              setProblem(null);
            }}
            label={t(`reasons.${value}.label`)}
            description={t(`reasons.${value}.${listing.kind}`)}
          />
        ))}
        {problem === 'reason' && (
          <p id="report-reason-error" role="alert" className="text-sm text-danger">
            {t('reasonRequired')}
          </p>
        )}
      </fieldset>

      <Textarea
        label={t('detailsLabel')}
        optional={reason === 'other' ? undefined : t('optional')}
        hint={
          reason === 'other' ? t('detailsHintOther', { min: REPORT_OTHER_MIN }) : t('detailsHint')
        }
        value={details}
        maxLength={REPORT_DETAILS_MAX}
        rows={5}
        onChange={(e) => {
          setDetails(e.target.value);
          if (problem === 'details') setProblem(null);
        }}
        error={problem === 'details' ? t('detailsRequired', { min: REPORT_OTHER_MIN }) : undefined}
      />

      <p className="text-sm text-ink-muted">
        {session.user ? t('privacySignedIn') : t('privacyAnonymous')}
      </p>

      {(problem === 'tooMany' || problem === 'gone' || problem === 'failed') && (
        <p role="alert" className="text-sm text-danger">
          {t(`problems.${problem}`)}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        loading={busy}
        loadingLabel={t('sending')}
        className="self-start"
      >
        {t('send')}
      </Button>
    </form>
  );
}
