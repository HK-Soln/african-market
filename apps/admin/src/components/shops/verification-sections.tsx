'use client';

import { useState, type ReactNode } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { KYC_DOCUMENT_KINDS, type KycDocumentKind } from '@am/contracts';
import { Badge, Button, Card } from '@am/ui';
import {
  kycConcerns,
  latest,
  licenseExpiry,
  type VerificationOverview,
  type VerificationRequest,
} from '@/lib/review';
import type { Result } from '@/lib/result';
import { shopsApi } from '@/lib/shops';
import { DecisionDialog } from '../decision-dialog';
import { DocumentViewer } from '../document-viewer';
import { RequestBadge } from './status';

/** A titled card section of the review page. */
export function Section({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="text-lg font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      <Card className="flex flex-col gap-4 p-4">{children}</Card>
    </section>
  );
}

/** Label and value pairs; an empty value shows a dash. */
export function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-sm text-ink-muted">{label}</dt>
          <dd className="max-sm:mb-1">{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The owner's identity check: what the provider found, what deserves a second look, and the
 * images, each opened on purpose (every view is recorded).
 */
export function IdentitySection({
  overview,
  today,
}: {
  overview: VerificationOverview;
  today: string;
}) {
  const t = useTranslations('review.identity');
  const format = useFormatter();
  const [viewing, setViewing] = useState<KycDocumentKind | null>(null);
  const request = latest(overview.requests, 'kyc');
  const kyc = request?.kyc;
  const concerns = kyc ? kycConcerns(kyc, today) : [];
  const score = (n: number | null | undefined) =>
    n === null || n === undefined ? null : format.number(n, { maximumFractionDigits: 1 });

  return (
    <Section
      id="review-identity"
      title={t('title')}
      aside={request && <RequestBadge status={request.status} />}
    >
      {!request ? (
        <p className="text-ink-muted">{t('notStarted')}</p>
      ) : !kyc ? (
        <p className="text-ink-muted">{t('noResult')}</p>
      ) : (
        <>
          {concerns.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label={t('concerns')}>
              {concerns.map((c) => (
                <li key={c}>
                  <Badge tone="warning">{t(`concern.${c}`)}</Badge>
                </li>
              ))}
            </ul>
          )}
          <Facts
            rows={[
              [t('provider'), kyc.providerStatus],
              [t('fullName'), kyc.fullName],
              [t('documentType'), kyc.documentType],
              [t('issuingState'), kyc.issuingState],
              [t('nationality'), kyc.nationality],
              [t('documentExpiry'), kyc.documentExpiry],
              [t('idStatus'), kyc.idStatus],
              [
                t('liveness'),
                kyc.livenessStatus &&
                  `${kyc.livenessStatus}${score(kyc.livenessScore) ? ` · ${score(kyc.livenessScore)}` : ''}`,
              ],
              [
                t('faceMatch'),
                kyc.faceMatchStatus &&
                  `${kyc.faceMatchStatus}${score(kyc.faceMatchScore) ? ` · ${score(kyc.faceMatchScore)}` : ''}`,
              ],
            ]}
          />
          {kyc.warnings.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold">{t('warnings')}</h3>
              <ul className="list-inside list-disc text-sm text-ink-muted">
                {kyc.warnings.map((w) => (
                  <li key={w} dir="ltr" className="text-start">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">{t('images')}</h3>
            <p className="text-sm text-ink-muted">{t('imagesHint')}</p>
            <div className="flex flex-wrap gap-2">
              {KYC_DOCUMENT_KINDS.map((kind) => (
                <Button key={kind} size="sm" iconStart="eye" onClick={() => setViewing(kind)}>
                  {t(`kind.${kind}`)}
                </Button>
              ))}
            </div>
          </div>
          <DocumentViewer
            title={viewing ? t(`kind.${viewing}`) : ''}
            open={viewing !== null}
            onClose={() => setViewing(null)}
            load={() => shopsApi.kycDocument(overview.shop.id, request.id, viewing!)}
          />
        </>
      )}
    </Section>
  );
}

/**
 * The trade licence: what the seller entered, the document, and the decision on it. Needed for
 * checkout (Phase 3); a listing does not wait for it.
 */
export function LicenseSection({
  overview,
  today,
  onChange,
}: {
  overview: VerificationOverview;
  today: string;
  onChange: (overview: VerificationOverview) => void;
}) {
  const t = useTranslations('review.license');
  const [viewing, setViewing] = useState(false);
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  const request = latest(overview.requests, 'trade_license');
  const license = overview.shop.tradeLicense;
  const expiry = licenseExpiry(license.expiry, today);

  const decide = async (
    decision: 'approve' | 'reject',
    reason?: string,
  ): Promise<Result<unknown>> => {
    const result = await shopsApi.decideLicense(overview.shop.id, request!.id, decision, reason);
    if (result.ok) onChange(result.data);
    return result;
  };

  return (
    <Section
      id="review-license"
      title={t('title')}
      aside={request && <RequestBadge status={request.status} />}
    >
      {!request ? (
        <p className="text-ink-muted">{t('none')}</p>
      ) : (
        <>
          <Facts
            rows={[
              [t('legalName'), license.legalName],
              [t('number'), license.number && <span dir="ltr">{license.number}</span>],
              [t('authority'), license.issuingAuthority],
              [
                t('expiry'),
                license.expiry && (
                  <span className="flex flex-wrap items-center gap-2">
                    {license.expiry}
                    {expiry === 'expired' && <Badge tone="danger">{t('expired')}</Badge>}
                    {expiry === 'soon' && <Badge tone="warning">{t('expiresSoon')}</Badge>}
                  </span>
                ),
              ],
            ]}
          />
          {request.reason && (
            <p className="text-sm">
              <span className="text-ink-muted">{t('reason')}: </span>
              {request.reason}
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {request.documentMediaId && (
              <Button size="sm" iconStart="eye" onClick={() => setViewing(true)}>
                {t('document')}
              </Button>
            )}
            {request.status === 'pending' && (
              <>
                <Button size="sm" variant="primary" onClick={() => setDeciding('approve')}>
                  {t('approve')}
                </Button>
                <Button size="sm" onClick={() => setDeciding('reject')}>
                  {t('reject')}
                </Button>
              </>
            )}
          </div>
          {request.documentMediaId && (
            <DocumentViewer
              title={t('document')}
              open={viewing}
              onClose={() => setViewing(false)}
              load={() => shopsApi.privateDocument(request.documentMediaId!)}
            />
          )}
          <DecisionDialog
            open={deciding !== null}
            onClose={() => setDeciding(null)}
            title={deciding === 'reject' ? t('rejectTitle') : t('approveTitle')}
            body={deciding === 'reject' ? t('rejectBody') : t('approveBody')}
            confirm={deciding === 'reject' ? t('reject') : t('approve')}
            reason={deciding === 'reject'}
            danger={deciding === 'reject'}
            onConfirm={(reason) => decide(deciding!, reason)}
          />
        </>
      )}
    </Section>
  );
}

/** Every request, newest first, with its outcome. */
export function HistorySection({ requests }: { requests: VerificationRequest[] }) {
  const t = useTranslations('review.history');
  const format = useFormatter();
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Dubai',
    });
  const sorted = [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <Section id="review-history" title={t('title')}>
      {sorted.length === 0 ? (
        <p className="text-ink-muted">{t('none')}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {sorted.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t(`type.${r.type}`)}</span>
                <RequestBadge status={r.status} />
              </span>
              <span className="text-[13px] text-ink-muted">
                {t('started', { when: when(r.createdAt) })}
                {r.decidedAt && ` · ${t('decided', { when: when(r.decidedAt) })}`}
              </span>
              {r.reason && <span className="text-sm">{r.reason}</span>}
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
