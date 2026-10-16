'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Locale } from '@am/i18n';
import {
  BottomSheet,
  Button,
  Card,
  CountryFlag,
  countryName,
  EmptyState,
  Input,
  Skeleton,
  Tabs,
  Toast,
  Toggle,
} from '@am/ui';
import { browserApi } from '@/lib/browser-api';

interface Country {
  code: string;
  name: { en: string; ar: string; fr: string };
  dialCode: string;
  flag: string;
  phoneEnabled: boolean;
  originEnabled: boolean;
  sortOrder: number;
}

type Change = Partial<Pick<Country, 'name' | 'phoneEnabled' | 'originEnabled' | 'sortOrder'>>;

const byOrder = (a: Country, b: Country) =>
  a.sortOrder - b.sortOrder || a.name.en.localeCompare(b.name.en, 'en');

/**
 * Every country, with its two switches (phone sign-up, origin), its order and its names. A
 * switch saves at once and goes back if the save fails. Search and the "enabled only" view are
 * asked of the server in the standard list format, a page at a time.
 */
export function CountriesEditor() {
  const t = useTranslations('countries');
  const locale = useLocale() as Locale;
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<'enabled' | 'all'>('enabled');
  const [query, setQuery] = useState('');
  const search = useDebounced(query.trim(), 250);
  const [editing, setEditing] = useState<Country | null>(null);
  const [toast, setToast] = useState<{ tone: 'success' | 'danger'; title: string } | null>(null);

  /** The first page for the current view and search, or the next one after `cursor`. */
  const load = useCallback(
    async (cursor?: string) => {
      setFailed(false);
      const { data, error } = await browserApi.GET('/api/v1/admin/countries', {
        params: {
          query: {
            ...(view === 'enabled' ? { 'filter[enabled]': true } : {}),
            ...(search ? { 'filter[search][like]': search } : {}),
            sort: 'sortOrder,name',
            limit: 50,
            ...(cursor ? { cursor } : {}),
          },
        },
      });
      if (error || !data) {
        setFailed(true);
        return;
      }
      setCountries((list) => (cursor ? [...(list ?? []), ...data.items] : data.items));
      setNextCursor(data.nextCursor);
    },
    [view, search],
  );

  useEffect(() => {
    setCountries(null);
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    await load(nextCursor);
    setLoadingMore(false);
  };

  /** Applies a change at once, saves it, and puts the old row back if the save fails. */
  const save = async (code: string, change: Change): Promise<boolean> => {
    const before = countries?.find((c) => c.code === code);
    if (!before) return false;
    setCountries((list) =>
      (list ?? []).map((c) => (c.code === code ? { ...c, ...change } : c)).sort(byOrder),
    );
    const { data, error } = await browserApi.PATCH('/api/v1/admin/countries/{code}', {
      params: { path: { code } },
      body: change,
    });
    if (error || !data) {
      setCountries((list) => (list ?? []).map((c) => (c.code === code ? before : c)).sort(byOrder));
      setToast({ tone: 'danger', title: t('saveFailed') });
      return false;
    }
    setCountries((list) => (list ?? []).map((c) => (c.code === code ? data : c)).sort(byOrder));
    setToast({ tone: 'success', title: t('saved') });
    return true;
  };

  const shown = countries ?? [];

  if (failed) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <EmptyState
          tone="danger"
          icon="alert-triangle"
          title={t('loadFailed')}
          action={<Button onClick={() => void load()}>{t('retry')}</Button>}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-ink-muted">{t('intro')}</p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          className="grow"
          label={t('search')}
          iconStart="search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <Tabs
          variant="segmented"
          label={t('title')}
          value={view}
          onChange={(id) => setView(id as 'enabled' | 'all')}
          items={[
            { id: 'enabled', label: t('showEnabled') },
            { id: 'all', label: t('showAll') },
          ]}
        />
      </div>

      {!countries ? (
        <div className="flex flex-col gap-3" role="status" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState compact icon="search" title={t('none')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((country) => (
            <li key={country.code}>
              <Card className="flex flex-col gap-3 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <CountryFlag code={country.code} size={18} />
                  <div className="flex min-w-0 grow flex-col">
                    <span className="truncate font-semibold">{countryName(country, locale)}</span>
                    <span className="text-[13px] text-ink-muted">
                      <bdi dir="ltr">
                        {country.code} · {country.dialCode}
                      </bdi>
                      {' · '}
                      {t('order')} {country.sortOrder}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(country)}>
                    {t('edit')}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <Toggle
                    label={t('phone')}
                    checked={country.phoneEnabled}
                    onChange={(event) =>
                      void save(country.code, { phoneEnabled: event.target.checked })
                    }
                  />
                  <Toggle
                    label={t('origin')}
                    checked={country.originEnabled}
                    onChange={(event) =>
                      void save(country.code, { originEnabled: event.target.checked })
                    }
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {nextCursor && (
        <Button onClick={() => void loadMore()} loading={loadingMore} loadingLabel={t('loading')}>
          {t('loadMore')}
        </Button>
      )}

      {editing && (
        <EditSheet
          country={editing}
          onClose={() => setEditing(null)}
          onSave={async (change) => {
            if (await save(editing.code, change)) setEditing(null);
          }}
        />
      )}

      {toast && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md">
          <Toast
            tone={toast.tone}
            title={toast.title}
            onClose={() => setToast(null)}
            closeLabel={t('cancel')}
          />
        </div>
      )}
    </main>
  );
}

function EditSheet({
  country,
  onClose,
  onSave,
}: {
  country: Country;
  onClose: () => void;
  onSave: (change: Change) => Promise<void>;
}) {
  const t = useTranslations('countries');
  const locale = useLocale() as Locale;
  const [name, setName] = useState(country.name);
  const [order, setOrder] = useState(String(country.sortOrder));
  const [busy, setBusy] = useState(false);
  const orderValue = Number(order);
  const valid =
    Object.values(name).every((value) => value.trim().length > 0) &&
    Number.isInteger(orderValue) &&
    orderValue >= 0;

  return (
    <BottomSheet
      title={countryName(country, locale)}
      closeLabel={t('cancel')}
      open
      onClose={onClose}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!valid) return;
          setBusy(true);
          await onSave({
            name: { en: name.en.trim(), ar: name.ar.trim(), fr: name.fr.trim() },
            sortOrder: orderValue,
          });
          setBusy(false);
        }}
      >
        <Input
          label={t('nameEn')}
          dir="ltr"
          value={name.en}
          onChange={(event) => setName({ ...name, en: event.target.value })}
          maxLength={100}
          required
        />
        <Input
          label={t('nameAr')}
          dir="rtl"
          lang="ar"
          value={name.ar}
          onChange={(event) => setName({ ...name, ar: event.target.value })}
          maxLength={100}
          required
        />
        <Input
          label={t('nameFr')}
          dir="ltr"
          lang="fr"
          value={name.fr}
          onChange={(event) => setName({ ...name, fr: event.target.value })}
          maxLength={100}
          required
        />
        <Input
          label={t('order')}
          hint={t('orderHint')}
          type="number"
          inputMode="numeric"
          min={0}
          max={100000}
          value={order}
          onChange={(event) => setOrder(event.target.value)}
          required
        />
        <div className="flex gap-3">
          <Button
            type="submit"
            variant="primary"
            disabled={!valid}
            loading={busy}
            loadingLabel={t('saving')}
          >
            {t('save')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}

/** The value once it has stopped changing for `ms`: one request per pause in typing. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
