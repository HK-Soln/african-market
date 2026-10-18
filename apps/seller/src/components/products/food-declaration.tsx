'use client';

import { useTranslations } from 'next-intl';
import { Checkbox, Input, Radio } from '@am/ui';
import type { FoodDraft, Storage } from '@/lib/product-form';

const STORAGE: Storage[] = ['ambient', 'chilled', 'frozen'];

/**
 * What a seller of food confirms before it can show: packaged and labelled, nothing restricted,
 * and how it is kept. Admins review food before customers see it.
 */
export function FoodDeclaration({
  food,
  error,
  onChange,
}: {
  food: FoodDraft;
  error?: string;
  onChange: (patch: Partial<FoodDraft>) => void;
}) {
  const t = useTranslations('products');
  const s = useTranslations('setup');
  return (
    <fieldset
      className="flex flex-col gap-4 rounded-lg border border-line p-4"
      aria-describedby={error ? 'food-error' : undefined}
    >
      <legend className="px-1 text-lg font-semibold">{t('foodTitle')}</legend>
      <p className="text-sm text-ink-muted">{t('foodIntro')}</p>
      <Checkbox
        label={t('foodPackaged')}
        description={t('foodPackagedHint')}
        checked={food.packagedAndLabelled}
        onChange={(ev) => onChange({ packagedAndLabelled: ev.target.checked })}
      />
      <Checkbox
        label={t('foodNoRestricted')}
        description={t('foodNoRestrictedHint')}
        checked={food.noRestrictedItems}
        onChange={(ev) => onChange({ noRestrictedItems: ev.target.checked })}
      />
      <div role="radiogroup" aria-labelledby="food-storage" className="flex flex-col gap-2">
        <span id="food-storage" className="font-semibold">
          {t('foodStorage')}
        </span>
        {STORAGE.map((kind) => (
          <Radio
            key={kind}
            name="food-storage"
            label={t(`storage${kind}`)}
            checked={food.storage === kind}
            onChange={() => onChange({ storage: kind })}
          />
        ))}
      </div>
      <Input
        label={t('foodManufacturer')}
        optional={s('optional')}
        maxLength={120}
        value={food.manufacturer}
        onChange={(ev) => onChange({ manufacturer: ev.target.value })}
      />
      <Input
        label={t('foodRegistration')}
        optional={s('optional')}
        hint={t('foodRegistrationHint')}
        dir="ltr"
        maxLength={60}
        value={food.registrationNumber}
        onChange={(ev) => onChange({ registrationNumber: ev.target.value })}
      />
      {error && (
        <p id="food-error" role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
