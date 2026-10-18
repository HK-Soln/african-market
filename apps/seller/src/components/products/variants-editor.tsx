'use client';

import { useTranslations } from 'next-intl';
import { Button, IconButton, Input } from '@am/ui';
import {
  MAX_VARIANTS,
  newVariant,
  type ProductDraft,
  type ProductProblem,
  type VariantDraft,
} from '@/lib/product-form';

/**
 * Price, and the versions the product comes in: one option (size, weight, colour) with a value,
 * price, old price and SKU for each. A product with one version shows just its price.
 */
export function VariantsEditor({
  draft,
  service,
  problem,
  onChange,
}: {
  draft: Pick<ProductDraft, 'optionName' | 'variants'>;
  /** A service may be priced on request. */
  service: boolean;
  problem: { problem: ProductProblem; variant?: number } | null;
  onChange: (patch: Partial<Pick<ProductDraft, 'optionName' | 'variants'>>) => void;
}) {
  const t = useTranslations('products');
  const s = useTranslations('setup');
  const several = draft.variants.length > 1;
  const errorAt = (i: number, ...kinds: ProductProblem[]) =>
    problem && problem.variant === i && kinds.includes(problem.problem)
      ? t(`problem${problem.problem}`)
      : undefined;

  const change = (i: number, patch: Partial<VariantDraft>) =>
    onChange({ variants: draft.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="product-prices">
      <div className="flex flex-col gap-1">
        <h2 id="product-prices" className="text-lg font-semibold">
          {several ? t('versions') : t('price')}
        </h2>
        <p className="text-sm text-ink-muted">{t('priceHint')}</p>
      </div>
      {several && (
        <Input
          label={t('optionName')}
          hint={t('optionNameHint')}
          placeholder={t('optionNamePlaceholder')}
          maxLength={30}
          value={draft.optionName}
          error={problem?.problem === 'optionName' ? t('problemoptionName') : undefined}
          onChange={(ev) => onChange({ optionName: ev.target.value })}
          className="max-w-sm"
        />
      )}
      <ol className="flex flex-col gap-3">
        {draft.variants.map((v, i) => (
          <li
            key={v.key}
            className={several ? 'flex flex-col gap-3 rounded-lg border border-line p-3' : ''}
          >
            {several && (
              <div className="flex items-end gap-2">
                <Input
                  label={draft.optionName.trim() || t('optionValue')}
                  placeholder={t('optionValuePlaceholder')}
                  maxLength={60}
                  value={v.value}
                  error={errorAt(i, 'optionValue', 'optionTwice')}
                  onChange={(ev) => change(i, { value: ev.target.value })}
                  className="flex-1"
                />
                <IconButton
                  icon="x"
                  label={t('removeVersion')}
                  onClick={() => onChange({ variants: draft.variants.filter((_, j) => j !== i) })}
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Input
                label={t('priceAed')}
                optional={service ? s('optional') : undefined}
                hint={service ? t('onRequestHint') : undefined}
                inputMode="decimal"
                dir="ltr"
                suffix="AED"
                value={v.price}
                error={errorAt(i, 'price')}
                onChange={(ev) => change(i, { price: ev.target.value })}
              />
              <Input
                label={t('compareAt')}
                optional={s('optional')}
                hint={t('compareAtHint')}
                inputMode="decimal"
                dir="ltr"
                suffix="AED"
                value={v.compareAt}
                error={errorAt(i, 'compareAt')}
                onChange={(ev) => change(i, { compareAt: ev.target.value })}
              />
              <Input
                label={t('sku')}
                optional={s('optional')}
                hint={t('skuHint')}
                dir="ltr"
                maxLength={64}
                value={v.sku}
                onChange={(ev) => change(i, { sku: ev.target.value })}
              />
            </div>
          </li>
        ))}
      </ol>
      {draft.variants.length < MAX_VARIANTS && (
        <Button
          type="button"
          iconStart="plus"
          className="self-start"
          onClick={() => onChange({ variants: [...draft.variants, newVariant()] })}
        >
          {several ? t('addVersion') : t('addVersions')}
        </Button>
      )}
    </section>
  );
}
