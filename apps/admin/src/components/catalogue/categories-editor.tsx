'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { pickLocalized, type Locale } from '@am/i18n';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Radio,
  Select,
  Skeleton,
  Toast,
} from '@am/ui';
import {
  categoryTree,
  MAX_CATEGORY_DEPTH,
  parentOptions,
  slugify,
  type Category,
  type CategoryBody,
  type TreeRow,
} from '@/lib/catalogue';
import { catalogueApi } from '@/lib/catalogue-api';
import { useErrorText } from '../error-text';

type Editing = { category: Category | null; parentId: string | null };

/**
 * The category tree, switched-off categories too. An admin adds a category at the top or under
 * another (three levels at most), renames it in each language, moves it, flags it for review or
 * food declarations, or switches it off (which hides everything under it).
 */
export function CategoriesEditor() {
  const t = useTranslations('categories');
  const locale = useLocale() as Locale;
  const errorText = useErrorText();
  const [rows, setRows] = useState<TreeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const result = await catalogueApi.categories();
    if (!result.ok) return setError(result.code);
    setError(null);
    setRows(categoryTree(result.data.items));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-ink-muted">{t('intro')}</p>
        </div>
        <Button
          variant="primary"
          iconStart="plus"
          onClick={() => setEditing({ category: null, parentId: null })}
        >
          {t('addTop')}
        </Button>
      </header>

      {error ? (
        <EmptyState
          icon="alert-triangle"
          tone="danger"
          title={errorText(error)}
          action={<Button onClick={() => void load()}>{t('retry')}</Button>}
        />
      ) : !rows ? (
        <Skeleton variant="block" height={400} />
      ) : (
        <Card className="p-0">
          <ul className="flex flex-col divide-y divide-line">
            {rows.map(({ category: c, depth, childCount }) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center gap-3 p-3"
                style={{ paddingInlineStart: `${12 + (depth - 1) * 24}px` }}
              >
                <span className="flex min-w-0 grow flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className={c.active ? 'font-semibold' : 'font-semibold text-ink-muted'}>
                      {pickLocalized(c.name, locale)}
                    </span>
                    {depth === 1 && <Badge tone="neutral">{t(`kind.${c.kind}`)}</Badge>}
                    {c.isRestricted && <Badge tone="warning">{t('restricted')}</Badge>}
                    {c.requiresDeclaration && <Badge tone="info">{t('declaration')}</Badge>}
                    {!c.checkoutAllowed && <Badge tone="neutral">{t('noCheckout')}</Badge>}
                    {!c.active && <Badge tone="danger">{t('inactive')}</Badge>}
                  </span>
                  <span className="text-[13px] text-ink-muted">
                    <span dir="ltr">{c.slug}</span>
                    {childCount > 0 && ` · ${t('children', { n: childCount })}`}
                  </span>
                </span>
                <span className="flex gap-2">
                  {depth < MAX_CATEGORY_DEPTH && (
                    <Button
                      size="sm"
                      variant="ghost"
                      iconStart="plus"
                      onClick={() => setEditing({ category: null, parentId: c.id })}
                    >
                      {t('addUnder')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() => setEditing({ category: c, parentId: c.parentId })}
                  >
                    {t('edit')}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {rows && editing && (
        <CategorySheet
          rows={rows}
          editing={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            setSaved(true);
            await load();
          }}
        />
      )}
      {saved && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md">
          <Toast
            tone="success"
            title={t('saved')}
            onClose={() => setSaved(false)}
            closeLabel={t('close')}
          />
        </div>
      )}
    </main>
  );
}

function CategorySheet({
  rows,
  editing,
  onClose,
  onSaved,
}: {
  rows: TreeRow[];
  editing: Editing;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations('categories');
  const locale = useLocale() as Locale;
  const errorText = useErrorText();
  const existing = editing.category;
  const parentOf = (id: string | null) => rows.find((r) => r.category.id === id)?.category;
  const [parentId, setParentId] = useState(editing.parentId ?? '');
  const parent = parentOf(parentId || null);
  const [kind, setKind] = useState<'product' | 'service'>(
    existing?.kind ?? parentOf(editing.parentId)?.kind ?? 'product',
  );
  const [name, setName] = useState({
    en: existing?.name.en ?? '',
    ar: existing?.name.ar ?? '',
    fr: existing?.name.fr ?? '',
  });
  const [slug, setSlug] = useState(existing?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(Boolean(existing));
  // A new category takes its parent's flags; the service does the same.
  const base = existing ?? parentOf(editing.parentId);
  const [flags, setFlags] = useState({
    isRestricted: base?.isRestricted ?? false,
    requiresDeclaration: base?.requiresDeclaration ?? false,
    checkoutAllowed: base?.checkoutAllowed ?? true,
    active: existing?.active ?? true,
  });
  const [sort, setSort] = useState(String(existing?.sort ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const options = parentOptions(rows, existing, existing ? existing.kind : parent ? null : kind);
  const effectiveKind = existing?.kind ?? parent?.kind ?? kind;

  const save = async () => {
    if (!name.en.trim() || !name.ar.trim()) return setError(t('namesRequired'));
    if (!slug) return setError(t('slugRequired'));
    const body: CategoryBody = {
      parentId: parentId || null,
      slug,
      name: {
        en: name.en.trim(),
        ar: name.ar.trim(),
        ...(name.fr.trim() ? { fr: name.fr.trim() } : {}),
      },
      ...flags,
      sort: Math.max(0, Math.min(10_000, Number.parseInt(sort, 10) || 0)),
      ...(existing ? {} : { kind: effectiveKind }),
    };
    setBusy(true);
    const result = existing
      ? await catalogueApi.updateCategory(existing.id, body)
      : await catalogueApi.createCategory(body);
    setBusy(false);
    if (result.ok) return onSaved();
    const reason = result.details?.reason;
    setError(
      result.code === 'CATEGORY_INVALID' && typeof reason === 'string' && t.has(`invalid.${reason}`)
        ? t(`invalid.${reason}`)
        : errorText(result.code),
    );
  };

  return (
    <BottomSheet
      open
      title={existing ? t('editTitle') : t('addTitle')}
      closeLabel={t('close')}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <Button
            variant="primary"
            fullWidth
            loading={busy}
            loadingLabel={t('saving')}
            onClick={() => void save()}
          >
            {t('save')}
          </Button>
        </div>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input
          label={t('nameEn')}
          value={name.en}
          maxLength={80}
          onChange={(e) => {
            setName({ ...name, en: e.target.value });
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
        <Input
          label={t('nameAr')}
          dir="rtl"
          lang="ar"
          value={name.ar}
          maxLength={80}
          onChange={(e) => setName({ ...name, ar: e.target.value })}
        />
        <Input
          label={t('nameFr')}
          optional={t('optional')}
          hint={t('nameFrHint')}
          lang="fr"
          value={name.fr}
          maxLength={80}
          onChange={(e) => setName({ ...name, fr: e.target.value })}
        />
        <Input
          label={t('slug')}
          hint={t('slugHint')}
          dir="ltr"
          value={slug}
          maxLength={60}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value.toLowerCase());
          }}
        />
        <Select
          label={t('parent')}
          value={parentId}
          placeholder={t('topLevel')}
          onChange={(e) => setParentId(e.target.value)}
          options={options.map((r) => ({
            value: r.category.id,
            label: `${'— '.repeat(r.depth - 1)}${pickLocalized(r.category.name, locale)}`,
          }))}
        />
        {!existing && !parent ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 font-semibold">{t('kindLabel')}</legend>
            {(['product', 'service'] as const).map((k) => (
              <Radio
                key={k}
                name="category-kind"
                label={t(`kind.${k}`)}
                checked={kind === k}
                onChange={() => setKind(k)}
              />
            ))}
          </fieldset>
        ) : (
          <p className="text-sm text-ink-muted">
            {t('kindFixed', { kind: t(`kind.${effectiveKind}`) })}
          </p>
        )}
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 font-semibold">{t('rules')}</legend>
          <Checkbox
            label={t('restricted')}
            description={t('restrictedHint')}
            checked={flags.isRestricted}
            onChange={(e) => setFlags({ ...flags, isRestricted: e.target.checked })}
          />
          <Checkbox
            label={t('declaration')}
            description={t('declarationHint')}
            checked={flags.requiresDeclaration}
            onChange={(e) => setFlags({ ...flags, requiresDeclaration: e.target.checked })}
          />
          <Checkbox
            label={t('checkoutAllowed')}
            description={t('checkoutAllowedHint')}
            checked={flags.checkoutAllowed}
            onChange={(e) => setFlags({ ...flags, checkoutAllowed: e.target.checked })}
          />
          <Checkbox
            label={t('active')}
            description={t('activeHint')}
            checked={flags.active}
            onChange={(e) => setFlags({ ...flags, active: e.target.checked })}
          />
        </fieldset>
        <Input
          label={t('sort')}
          hint={t('sortHint')}
          type="number"
          inputMode="numeric"
          min={0}
          max={10000}
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        />
      </form>
    </BottomSheet>
  );
}
