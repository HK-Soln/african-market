'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'next-intl';
import { Badge, Button, Card, EmptyState, Skeleton, Toast, Toggle } from '@am/ui';
import type { Emirate } from '@/lib/catalogue';
import { searchApi } from '@/lib/catalogue-api';
import { DecisionDialog } from '../decision-dialog';
import { useErrorText } from '../error-text';

/**
 * Customer search per emirate, with how many verified shops and branches each has now. Search
 * opens in an emirate once it has enough verified shops to be worth it (product rule 4); closing
 * it hides every shop there from search at once. Below, the search index can be rebuilt from
 * the shops and the catalogue, if it ever drifts.
 */
export function EmiratesSearch() {
  const t = useTranslations('emiratesSearch');
  const names = useTranslations('emirates');
  const format = useFormatter();
  const errorText = useErrorText();
  const [emirates, setEmirates] = useState<Emirate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [switching, setSwitching] = useState<Emirate | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await searchApi.emirates();
    if (!result.ok) return setError(result.code);
    setError(null);
    setEmirates(result.data.items);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const count = (n: number | null | undefined) => format.number(n ?? 0);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-ink-muted">{t('intro')}</p>
      </header>

      {error ? (
        <EmptyState
          icon="alert-triangle"
          tone="danger"
          title={errorText(error)}
          action={<Button onClick={() => void load()}>{t('retry')}</Button>}
        />
      ) : !emirates ? (
        <Skeleton variant="block" height={420} />
      ) : (
        <Card className="p-0">
          <ul className="flex flex-col divide-y divide-line">
            {emirates.map((e) => (
              <li key={e.code} className="flex flex-wrap items-center gap-3 p-4">
                <span className="flex min-w-0 grow flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{names(e.code)}</span>
                    {e.searchOpen ? (
                      <Badge tone="success">{t('open')}</Badge>
                    ) : (
                      <Badge tone="neutral">{t('closed')}</Badge>
                    )}
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    {t('counts', { shops: count(e.verifiedShops), branches: count(e.branches) })}
                  </span>
                </span>
                <Toggle
                  label={t('searchLabel')}
                  checked={e.searchOpen}
                  onChange={() => setSwitching(e)}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section aria-labelledby="rebuild" className="flex flex-col gap-3">
        <h2 id="rebuild" className="text-lg font-semibold">
          {t('rebuildTitle')}
        </h2>
        <Card className="flex flex-col items-start gap-3 p-4">
          <p className="text-sm text-ink-muted">{t('rebuildBody')}</p>
          <Button iconStart="refresh" onClick={() => setRebuilding(true)}>
            {t('rebuild')}
          </Button>
        </Card>
      </section>

      <DecisionDialog
        open={switching !== null}
        onClose={() => setSwitching(null)}
        title={
          switching
            ? t(switching.searchOpen ? 'closeTitle' : 'openTitle', { name: names(switching.code) })
            : ''
        }
        body={
          !switching
            ? ''
            : switching.searchOpen
              ? t('closeBody')
              : switching.verifiedShops
                ? t('openBody', { shops: count(switching.verifiedShops) })
                : t('openEmptyBody')
        }
        confirm={switching?.searchOpen ? t('close') : t('openAction')}
        danger={switching?.searchOpen}
        onConfirm={async () => {
          const result = await searchApi.setSearch(switching!.code, !switching!.searchOpen);
          if (result.ok) {
            setEmirates(result.data.items);
            setToast(switching!.searchOpen ? t('closedDone') : t('openedDone'));
          }
          return result;
        }}
      />
      <DecisionDialog
        open={rebuilding}
        onClose={() => setRebuilding(false)}
        title={t('rebuildConfirmTitle')}
        body={t('rebuildConfirmBody')}
        confirm={t('rebuild')}
        onConfirm={async () => {
          const result = await searchApi.rebuild();
          if (result.ok) {
            setToast(
              t('rebuilt', {
                shops: count(result.data.shops),
                products: count(result.data.products),
                removed: count(result.data.removed),
              }),
            );
            void load();
          }
          return result;
        }}
      />
      {toast && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md">
          <Toast
            tone="success"
            title={toast}
            onClose={() => setToast(null)}
            closeLabel={t('dismiss')}
          />
        </div>
      )}
    </main>
  );
}
