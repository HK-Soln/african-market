'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { Button, Card, Chip, EmptyState, Select, Skeleton } from '@am/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { ACTION_GROUPS, auditQuery, subjectHref, type AuditEntry } from '@/lib/audit';
import { browserApi } from '@/lib/browser-api';
import { run } from '@/lib/result';
import { useErrorText } from './error-text';

/**
 * Who did what, newest first: listing and licence decisions, identity images and documents
 * opened, products moderated, categories, search and countries changed, roles given. Filter by
 * action; `?shopId=` narrows it to one shop (the shop review page links here).
 */
export function AuditLog() {
  const t = useTranslations('audit');
  const format = useFormatter();
  const errorText = useErrorText();
  const router = useRouter();
  const shopId = useSearchParams().get('shopId');
  const [action, setAction] = useState('');
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(
    async (cursor?: string) => {
      const result = await run(
        browserApi.GET('/api/v1/admin/audit', {
          params: { query: auditQuery(action, shopId, cursor) },
        }),
      );
      if (!result.ok) return setError(result.code);
      setError(null);
      setEntries((before) =>
        cursor ? [...(before ?? []), ...result.data.items] : result.data.items,
      );
      setNextCursor(result.data.nextCursor);
    },
    [action, shopId],
  );

  useEffect(() => {
    setEntries(null);
    void load();
  }, [load]);

  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: 'Asia/Dubai',
    });

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-ink-muted">{t('intro')}</p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Select
          label={t('action')}
          value={action}
          placeholder={t('allActions')}
          onChange={(e) => setAction(e.target.value)}
          options={ACTION_GROUPS.flatMap((g) =>
            g.actions.map((a) => ({
              value: a,
              label: `${t(`area.${g.area}`)}: ${t(`actions.${a}`)}`,
            })),
          )}
          className="sm:max-w-md sm:grow"
        />
        {shopId && (
          <Chip
            selected
            icon="building-store"
            onRemove={() => router.replace('/audit')}
            removeLabel={t('allShops')}
          >
            {t('oneShop')}
          </Chip>
        )}
      </div>

      {error ? (
        <EmptyState
          icon="alert-triangle"
          tone="danger"
          title={errorText(error)}
          action={<Button onClick={() => void load()}>{t('retry')}</Button>}
        />
      ) : !entries ? (
        <Skeleton variant="block" height={400} />
      ) : entries.length === 0 ? (
        <EmptyState icon="list" title={t('empty')} />
      ) : (
        <>
          <Card className="p-0">
            <ol className="flex flex-col divide-y divide-line">
              {entries.map((e) => (
                <Entry key={e.id} entry={e} when={when(e.occurredAt)} />
              ))}
            </ol>
          </Card>
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
    </main>
  );
}

function Entry({ entry, when }: { entry: AuditEntry; when: string }) {
  const t = useTranslations('audit');
  const kinds = useTranslations('review.identity.kind');
  const href = subjectHref(entry);
  const who = entry.actorId ? entry.actorName || t('anAdmin') : t('server');
  const { reason, kind } = entry.details as { reason?: string | null; kind?: string };

  return (
    <li className="flex flex-col gap-1 p-4">
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="font-semibold">{t(`actions.${entry.action}`)}</span>
        <time dateTime={entry.occurredAt} className="text-[13px] text-ink-muted">
          {when}
        </time>
      </span>
      <span className="text-sm">
        {t('by', { who })}
        {href && (
          <>
            {' · '}
            <Link href={href} className="font-semibold text-clay-ink">
              {t(`subject.${entry.subjectType}`)}
            </Link>
          </>
        )}
        {(entry.subjectType === 'emirate' || entry.subjectType === 'country') && (
          <span dir="ltr"> {entry.subjectId}</span>
        )}
      </span>
      {kind && kinds.has(kind) && <span className="text-sm">{kinds(kind)}</span>}
      {reason && (
        <span className="text-sm">
          <span className="text-ink-muted">{t('reason')}: </span>
          {reason}
        </span>
      )}
      {entry.correlationId && (
        <span className="text-xs text-ink-muted">
          {t('request')}: <span dir="ltr">{entry.correlationId}</span>
        </span>
      )}
    </li>
  );
}
