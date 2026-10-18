'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { pickLocalized, type Locale } from '@am/i18n';
import {
  Button,
  Chip,
  countryName,
  Field,
  Input,
  matchesCountry,
  Textarea,
  type CountryOption,
} from '@am/ui';
import { shopsApi, type SellerShop } from '@/lib/shops';
import { useErrorText } from '../error-text';

export interface CategoryOption {
  id: string;
  parentId: string | null;
  name: Partial<Record<string, string>>;
}

const MAX_CATEGORIES = 3;
const MAX_ORIGINS = 5;

/**
 * The shop's name, description (English, Arabic, French), what it sells and where its goods come
 * from. Creates the shop the first time, then updates it.
 */
export function DetailsForm({
  shop,
  categories,
  countries,
  onSaved,
}: {
  shop?: SellerShop;
  categories: CategoryOption[];
  countries: CountryOption[];
  onSaved: (shop: SellerShop) => void;
}) {
  const t = useTranslations('setup');
  const locale = useLocale() as Locale;
  const errorText = useErrorText();
  const [name, setName] = useState(shop?.name ?? '');
  const [description, setDescription] = useState({
    en: shop?.description.en ?? '',
    ar: shop?.description.ar ?? '',
    fr: shop?.description.fr ?? '',
  });
  const [categoryIds, setCategoryIds] = useState<string[]>(shop?.categoryIds ?? []);
  const [origins, setOrigins] = useState<string[]>(shop?.originCountries ?? []);
  const [countryQuery, setCountryQuery] = useState('');
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topLevel = categories.filter((c) => !c.parentId);
  const shownCountries = useMemo(() => {
    const q = countryQuery.trim();
    const found = q ? countries.filter((c) => matchesCountry(c, q)) : countries;
    // Chosen ones stay visible whatever is searched.
    return [
      ...countries.filter((c) => origins.includes(c.code)),
      ...found.filter((c) => !origins.includes(c.code)),
    ];
  }, [countries, countryQuery, origins]);

  const nameError = tried && !name.trim() ? t('nameRequired') : undefined;
  const categoryError = tried && categoryIds.length === 0 ? t('categoriesRequired') : undefined;

  const toggle = (list: string[], id: string, max: number) =>
    list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTried(true);
    if (!name.trim() || categoryIds.length === 0) return;
    setSaving(true);
    setError(null);
    const body = {
      name: name.trim(),
      description: Object.fromEntries(
        Object.entries(description)
          .map(([k, v]) => [k, v.trim()])
          .filter(([, v]) => v),
      ),
      categoryIds,
      originCountries: origins,
    };
    const result = shop ? await shopsApi.update(shop.id, body) : await shopsApi.create(body);
    setSaving(false);
    if (!result.ok) {
      setError(errorText(result.code));
      return;
    }
    onSaved(result.data);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <Input
        label={t('name')}
        placeholder={t('namePlaceholder')}
        value={name}
        maxLength={120}
        onChange={(e) => setName(e.target.value)}
        error={nameError}
        autoComplete="organization"
      />
      <Textarea
        label={t('descriptionEn')}
        hint={t('descriptionHint')}
        optional={t('optional')}
        dir="ltr"
        lang="en"
        maxLength={2000}
        value={description.en}
        onChange={(e) => setDescription({ ...description, en: e.target.value })}
      />
      <Textarea
        label={t('descriptionAr')}
        optional={t('optional')}
        dir="rtl"
        lang="ar"
        maxLength={2000}
        value={description.ar}
        onChange={(e) => setDescription({ ...description, ar: e.target.value })}
      />
      <Textarea
        label={t('descriptionFr')}
        optional={t('optional')}
        dir="ltr"
        lang="fr"
        maxLength={2000}
        value={description.fr}
        onChange={(e) => setDescription({ ...description, fr: e.target.value })}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">{t('categories')}</legend>
        <p className="text-sm text-ink-muted">{t('categoriesHint')}</p>
        <div className="flex flex-wrap gap-2">
          {topLevel.map((c) => (
            <Chip
              key={c.id}
              selected={categoryIds.includes(c.id)}
              onClick={() => setCategoryIds(toggle(categoryIds, c.id, MAX_CATEGORIES))}
            >
              {pickLocalized(c.name, locale)}
            </Chip>
          ))}
        </div>
        {categoryError && (
          <p role="alert" className="text-sm text-danger">
            {categoryError}
          </p>
        )}
      </fieldset>

      {countries.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-semibold">
            {t('origins')} <span className="font-normal text-ink-muted">{t('optional')}</span>
          </legend>
          <p className="text-sm text-ink-muted">{t('originsHint')}</p>
          <Field id="origin-search" label={t('originSearch')} className="max-w-sm">
            <div className="am-input min-w-0">
              <input
                id="origin-search"
                type="search"
                autoComplete="off"
                value={countryQuery}
                onChange={(e) => setCountryQuery(e.target.value)}
              />
            </div>
          </Field>
          <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
            {shownCountries.map((c) => (
              <Chip
                key={c.code}
                flag={c.code}
                selected={origins.includes(c.code)}
                onClick={() => setOrigins(toggle(origins, c.code, MAX_ORIGINS))}
              >
                {countryName(c, locale)}
              </Chip>
            ))}
            {shownCountries.length === 0 && (
              <p className="text-sm text-ink-muted">{t('noCountries')}</p>
            )}
          </div>
        </fieldset>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        loading={saving}
        loadingLabel={t('saving')}
        className="self-start"
      >
        {t('save')}
      </Button>
    </form>
  );
}
