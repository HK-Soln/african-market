'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { REPORT_STATUSES, type ReportOutcome, type ReportStatus } from '@am/contracts';
import { pickLocalized, type Locale } from '@am/i18n';
import { Badge, Button, Card, EmptyState, Select, Skeleton, Tabs, Toast } from '@am/ui';
import { Link } from '@/i18n/navigation';
import { config } from '@/lib/config';
import { reportsQuery, type ProductReport, type ReportKind, type ShopReport } from '@/lib/reports';
import { reportsApi } from '@/lib/reports-api';
import { shopsApi } from '@/lib/shops';
import { DecisionDialog } from './decision-dialog';
import { useErrorText } from './error-text';

type Report = ShopReport | ProductReport;
const isProduct = (report: Report): report is ProductReport => 'productId' in report;

/**
 * Reports from customers on shops and products, open ones oldest first. Closing one closes every
 * open report on the same listing; what to do about the listing itself (suspend the shop, reject
 * the product) is done on the shop's review, linked from each card.
 */
export function ReportsQueue() {
  const t = useTranslations('reports');
  const errorText = useErrorText();
  const [kind, setKind] = useState<ReportKind>('shops');
  const [status, setStatus] = useState<ReportStatus>('open');
  const [reports, setReports] = useState<Report[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [shopNames, setShopNames] = useState<Map<string, string>>(new Map());
  const [deciding, setDeciding] = useState<{ report: Report; outcome: ReportOutcome } | null>(null);
  const [closed, setClosed] = useState<number | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      const query = reportsQuery(status, cursor);
      const result = await (kind === 'shops'
        ? reportsApi.shops(query)
        : reportsApi.products(query));
      if (!result.ok) return setError(result.code);
      setError(null);
      const items: Report[] = result.data.items;
      setReports((before) => (cursor ? [...(before ?? []), ...items] : items));
      setNextCursor(result.data.nextCursor);
    },
    [kind, status],
  );

  useEffect(() => {
    setReports(null);
    void load();
  }, [load]);

  // Product reports name the product; the shop's name comes from shops, once per shop.
  useEffect(() => {
    const missing = [...new Set((reports ?? []).filter(isProduct).map((r) => r.shopId))].filter(
      (id) => !shopNames.has(id),
    );
    if (!missing.length) return;
    void Promise.all(missing.map((id) => shopsApi.verification(id))).then((results) => {
      setShopNames((before) => {
        const next = new Map(before);
        results.forEach((r, i) => next.set(missing[i], r.ok ? r.data.shop.name : ''));
        return next;
      });
    });
  }, [reports, shopNames]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-ink-muted">{t('intro')}</p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Tabs
          label={t('kindLabel')}
          items={[
            { id: 'shops', label: t('kind.shops'), icon: 'building-store' },
            { id: 'products', label: t('kind.products'), icon: 'package' },
          ]}
          value={kind}
          onChange={(id) => setKind(id as ReportKind)}
        />
        <Select
          label={t('status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as ReportStatus)}
          options={REPORT_STATUSES.map((s) => ({ value: s, label: t(`statuses.${s}`) }))}
          className="sm:max-w-xs"
        />
      </div>

      {error ? (
        <EmptyState
          icon="alert-triangle"
          tone="danger"
          title={errorText(error)}
          action={<Button onClick={() => void load()}>{t('retry')}</Button>}
        />
      ) : !reports ? (
        <div className="flex flex-col gap-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="block" height={140} />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <EmptyState icon="circle-check" title={status === 'open' ? t('emptyOpen') : t('empty')} />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {reports.map((report) => (
              <li key={report.id}>
                <ReportCard
                  report={report}
                  shopName={isProduct(report) ? shopNames.get(report.shopId) : report.shopName}
                  onDecide={(outcome) => setDeciding({ report, outcome })}
                />
              </li>
            ))}
          </ul>
          {nextCursor && (
            <Button
              variant="secondary"
              className="self-center"
              loading={loadingMore}
              loadingLabel={t('loading')}
              onClick={async () => {
                setLoadingMore(true);
                await load(nextCursor);
                setLoadingMore(false);
              }}
            >
              {t('loadMore')}
            </Button>
          )}
        </>
      )}

      <DecisionDialog
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={deciding?.outcome === 'dismissed' ? t('dismissTitle') : t('resolveTitle')}
        body={deciding?.outcome === 'dismissed' ? t('dismissBody') : t('resolveBody')}
        confirm={deciding?.outcome === 'dismissed' ? t('dismiss') : t('resolve')}
        note={{ label: t('note'), hint: t('noteHint') }}
        onConfirm={async (note) => {
          const { report, outcome } = deciding!;
          const result = await reportsApi.decide(kind, report.id, outcome, note);
          if (result.ok) {
            setClosed(result.data.closed);
            void load();
          }
          return result;
        }}
      />
      {closed !== null && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md">
          <Toast
            tone="success"
            title={t('closed', { n: closed })}
            onClose={() => setClosed(null)}
            closeLabel={t('close')}
          />
        </div>
      )}
    </main>
  );
}

function ReportCard({
  report,
  shopName,
  onDecide,
}: {
  report: Report;
  shopName?: string;
  onDecide: (outcome: ReportOutcome) => void;
}) {
  const t = useTranslations('reports');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Dubai',
    });

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <Badge
            tone={
              report.reason === 'fraud' || report.reason === 'prohibited' ? 'danger' : 'warning'
            }
          >
            {t(`reasons.${report.reason}`)}
          </Badge>
          {report.status !== 'open' && (
            <Badge tone={report.status === 'resolved' ? 'success' : 'neutral'}>
              {t(`statuses.${report.status}`)}
            </Badge>
          )}
          <span className="text-[13px] text-ink-muted">
            {t('sentAt', { when: when(report.createdAt) })} ·{' '}
            {report.signedIn ? t('signedIn') : t('anonymous')}
          </span>
        </p>
        <h2 className="text-lg font-semibold">
          {isProduct(report)
            ? pickLocalized(report.productTitle, locale) || t('untitled')
            : report.shopName}
        </h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <Link href={`/shops/${report.shopId}`} className="font-semibold text-clay-ink">
            {isProduct(report) ? shopName || t('shop') : t('review')}
          </Link>
          {!isProduct(report) && report.shopSlug && (
            <a
              href={`${config.webUrl}/${locale}/s/${report.shopSlug}`}
              target="_blank"
              rel="noreferrer"
              className="text-ink-muted underline"
            >
              {t('publicPage')}
            </a>
          )}
        </p>
      </div>

      {report.details ? (
        <p className="whitespace-pre-line rounded-md bg-surface-sunken p-3 text-sm">
          {report.details}
        </p>
      ) : (
        <p className="text-sm text-ink-muted">{t('noDetails')}</p>
      )}

      {report.status === 'open' ? (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          <Button variant="primary" onClick={() => onDecide('resolved')}>
            {t('resolve')}
          </Button>
          <Button onClick={() => onDecide('dismissed')}>{t('dismiss')}</Button>
        </div>
      ) : (
        <p className="border-t border-line pt-3 text-sm text-ink-muted">
          {report.decidedAt && t('decidedAt', { when: when(report.decidedAt) })}
          {report.decisionNote && (
            <>
              {' · '}
              <span className="text-ink">{report.decisionNote}</span>
            </>
          )}
        </p>
      )}
    </Card>
  );
}
