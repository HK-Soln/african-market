'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { pickLocalized, type Locale } from '@am/i18n';
import { BottomSheet, Button, Chip, Input, matchesCountry } from '@am/ui';
import { hasFilters, RADIUS_STEPS_KM, type SearchState } from '@/lib/search/params';
import { useSearchData } from './search-data';

type Sheet = 'radius' | 'category' | 'origin' | null;

/** The filter chips under the search bar, in one row that scrolls sideways on a phone. */
export function SearchFilters({
  state,
  onChange,
}: {
  state: SearchState;
  onChange: (next: SearchState) => void;
}) {
  const t = useTranslations('search');
  const locale = useLocale() as Locale;
  const { categories, countries, countryName } = useSearchData();
  const [sheet, setSheet] = useState<Sheet>(null);
  const set = (patch: Partial<SearchState>) => onChange({ ...state, ...patch });
  const pick = (patch: Partial<SearchState>) => {
    set(patch);
    setSheet(null);
  };

  const category = categories.find((c) => c.id === state.categoryId);

  return (
    <>
      <div
        role="group"
        aria-label={t('filtersLabel')}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
      >
        <Chip selected={state.mode === 'pickup'} onClick={() => set({ mode: 'pickup' })}>
          {t('pickup')}
        </Chip>
        <Chip selected={state.mode === 'delivery'} onClick={() => set({ mode: 'delivery' })}>
          {t('delivery')}
        </Chip>
        {state.mode === 'pickup' && (
          <>
            <Chip dropdown onClick={() => setSheet('radius')}>
              {t('within', { km: state.radiusKm })}
            </Chip>
            <Chip
              selected={state.deliversToMe}
              icon="truck"
              onClick={() => set({ deliversToMe: !state.deliversToMe })}
            >
              {t('deliversToMe')}
            </Chip>
          </>
        )}
        <Chip
          selected={state.openNow}
          icon="clock"
          onClick={() => set({ openNow: !state.openNow })}
        >
          {t('openNow')}
        </Chip>
        {categories.length > 0 && (
          <Chip dropdown selected={Boolean(category)} onClick={() => setSheet('category')}>
            {category ? pickLocalized(category.name, locale) : t('category')}
          </Chip>
        )}
        {countries.length > 0 && (
          <Chip
            dropdown
            selected={Boolean(state.origin)}
            flag={state.origin}
            icon={state.origin ? undefined : 'world'}
            onClick={() => setSheet('origin')}
          >
            {state.origin ? countryName(state.origin) : t('origin')}
          </Chip>
        )}
        {hasFilters(state) && (
          <Button
            variant="ghost"
            className="shrink-0"
            onClick={() =>
              set({ categoryId: undefined, origin: undefined, openNow: false, deliversToMe: false })
            }
          >
            {t('clearFilters')}
          </Button>
        )}
      </div>

      <BottomSheet
        title={t('radiusTitle')}
        open={sheet === 'radius'}
        onClose={() => setSheet(null)}
        closeLabel={t('close')}
      >
        <div className="flex flex-wrap gap-2">
          {RADIUS_STEPS_KM.map((km) => (
            <Chip key={km} selected={state.radiusKm === km} onClick={() => pick({ radiusKm: km })}>
              {t('within', { km })}
            </Chip>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet
        title={t('categoryTitle')}
        open={sheet === 'category'}
        onClose={() => setSheet(null)}
        closeLabel={t('close')}
      >
        <CategoryChoices
          selected={state.categoryId}
          onPick={(categoryId) => pick({ categoryId })}
        />
      </BottomSheet>

      <BottomSheet
        title={t('originTitle')}
        open={sheet === 'origin'}
        onClose={() => setSheet(null)}
        closeLabel={t('close')}
      >
        <OriginChoices selected={state.origin} onPick={(origin) => pick({ origin })} />
      </BottomSheet>
    </>
  );
}

/** Every category, each parent followed by its own. */
function CategoryChoices({
  selected,
  onPick,
}: {
  selected?: string;
  onPick: (id: string | undefined) => void;
}) {
  const t = useTranslations('search');
  const locale = useLocale() as Locale;
  const { categories } = useSearchData();
  const parents = categories.filter((c) => !c.parentId);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Chip selected={!selected} onClick={() => onPick(undefined)}>
          {t('anyCategory')}
        </Chip>
      </div>
      {parents.map((parent) => {
        const children = categories.filter((c) => c.parentId === parent.id);
        return (
          <section key={parent.id} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-ink-muted">
              {pickLocalized(parent.name, locale)}
            </h3>
            <div className="flex flex-wrap gap-2">
              <Chip selected={selected === parent.id} onClick={() => onPick(parent.id)}>
                {t('anyCategory')}
              </Chip>
              {children.map((child) => (
                <Chip
                  key={child.id}
                  selected={selected === child.id}
                  onClick={() => onPick(child.id)}
                >
                  {pickLocalized(child.name, locale)}
                </Chip>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** The countries shops can be from, with their flags, and a box to find one. */
function OriginChoices({
  selected,
  onPick,
}: {
  selected?: string;
  onPick: (code: string | undefined) => void;
}) {
  const t = useTranslations('search');
  const { countries, countryName } = useSearchData();
  const [query, setQuery] = useState('');
  const shown = useMemo(
    () => (query.trim() ? countries.filter((c) => matchesCountry(c, query)) : countries),
    [countries, query],
  );
  return (
    <div className="flex flex-col gap-4">
      <Input
        label={t('originSearch')}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoComplete="off"
      />
      <div className="flex flex-wrap gap-2">
        {!query.trim() && (
          <Chip selected={!selected} icon="world" onClick={() => onPick(undefined)}>
            {t('anyOrigin')}
          </Chip>
        )}
        {shown.map((country) => (
          <Chip
            key={country.code}
            flag={country.code}
            selected={selected === country.code}
            onClick={() => onPick(country.code)}
          >
            {countryName(country.code)}
          </Chip>
        ))}
      </div>
      {shown.length === 0 && <p className="text-sm text-ink-muted">{t('noCountries')}</p>}
    </div>
  );
}
