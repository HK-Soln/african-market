'use client';

import { useTranslations } from 'next-intl';
import { Checkbox, Input, Toggle } from '@am/ui';
import { cellOf, type ListingCell, type ListingGrid, type VariantDraft } from '@/lib/product-form';
import type { SellerBranch } from '@/lib/shops';

/**
 * Where the product is sold: for each branch, which versions it has, whether they are in stock,
 * how many are left (if the seller counts) and a branch price that differs from the usual one.
 */
export function ListingsEditor({
  branches,
  variants,
  optionName,
  grid,
  problem,
  onChange,
}: {
  branches: SellerBranch[];
  variants: VariantDraft[];
  optionName: string;
  grid: ListingGrid;
  problem: { problem: 'quantity' | 'branchPrice'; branchId: string; key: string } | null;
  onChange: (grid: ListingGrid) => void;
}) {
  const t = useTranslations('products');
  const s = useTranslations('setup');
  const several = variants.length > 1;

  const set = (branchId: string, key: string, patch: Partial<ListingCell>) =>
    onChange({
      ...grid,
      [branchId]: { ...grid[branchId], [key]: { ...cellOf(grid, branchId, key), ...patch } },
    });
  const setBranch = (branchId: string, listed: boolean) =>
    onChange({
      ...grid,
      [branchId]: Object.fromEntries(
        variants.map((v) => [v.key, { ...cellOf(grid, branchId, v.key), listed }]),
      ),
    });
  const errorAt = (branchId: string, key: string, kind: 'quantity' | 'branchPrice') =>
    problem?.branchId === branchId && problem.key === key && problem.problem === kind
      ? t(`problem${kind}`)
      : undefined;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="product-where">
      <div className="flex flex-col gap-1">
        <h2 id="product-where" className="text-lg font-semibold">
          {t('where')}
        </h2>
        <p className="text-sm text-ink-muted">{t('whereHint')}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {branches.map((branch) => {
          const cells = variants.map((v) => cellOf(grid, branch.id, v.key));
          const sold = cells.some((c) => c.listed);
          return (
            <li key={branch.id} className="flex flex-col gap-3 rounded-lg border border-line p-3">
              <Checkbox
                label={<span className="font-semibold">{branch.name}</span>}
                description={branch.area ?? undefined}
                checked={sold}
                onChange={(ev) => setBranch(branch.id, ev.target.checked)}
              />
              {sold && (
                <ul className="flex flex-col gap-3 ps-2">
                  {variants.map((v, i) => {
                    const cell = cells[i];
                    return (
                      <li key={v.key} className="flex flex-col gap-2">
                        {several && (
                          <Checkbox
                            label={
                              v.value.trim() || `${optionName.trim() || t('optionValue')} ${i + 1}`
                            }
                            checked={cell.listed}
                            onChange={(ev) => set(branch.id, v.key, { listed: ev.target.checked })}
                          />
                        )}
                        {cell.listed && (
                          <div className="flex flex-wrap items-end gap-3">
                            <Toggle
                              label={cell.inStock ? t('inStock') : t('outOfStock')}
                              checked={cell.inStock}
                              onChange={(ev) =>
                                set(branch.id, v.key, { inStock: ev.target.checked })
                              }
                            />
                            <Input
                              label={t('quantity')}
                              optional={s('optional')}
                              inputMode="numeric"
                              dir="ltr"
                              className="w-32"
                              value={cell.quantity}
                              error={errorAt(branch.id, v.key, 'quantity')}
                              onChange={(ev) =>
                                set(branch.id, v.key, { quantity: ev.target.value })
                              }
                            />
                            <Input
                              label={t('branchPrice')}
                              optional={s('optional')}
                              inputMode="decimal"
                              dir="ltr"
                              suffix="AED"
                              className="w-40"
                              placeholder={v.price}
                              value={cell.price}
                              error={errorAt(branch.id, v.key, 'branchPrice')}
                              onChange={(ev) => set(branch.id, v.key, { price: ev.target.value })}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
