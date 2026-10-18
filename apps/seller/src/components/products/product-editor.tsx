'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { pickLocalized, type Locale } from '@am/i18n';
import {
  Badge,
  Button,
  countryName,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
  type CountryOption,
} from '@am/ui';
import { Link, useRouter } from '@/i18n/navigation';
import {
  draftFromProduct,
  listingGrid,
  listingsBody,
  productBody,
  productCategories,
  statusActions,
  type ListingGrid,
  type ListingProblem,
  type ProductCategory,
  type ProductDraft,
  type ProductProblem,
  type SellerProduct,
} from '@/lib/product-form';
import { productsApi, useSellerProduct } from '@/lib/products';
import { useSellerShop, type SellerShop } from '@/lib/shops';
import { useErrorText } from '../error-text';
import { FoodDeclaration } from './food-declaration';
import { ListingsEditor } from './listings-editor';
import { PRODUCT_TONE } from './product-list';
import { ProductPhotos } from './product-photos';
import { VariantsEditor } from './variants-editor';

interface Props {
  shopId: string;
  productId?: string;
  categories: ProductCategory[];
  origins: CountryOption[];
}

/** A new product, or one of the shop's: loads both, then hands them to the form. */
export function ProductEditor({ shopId, productId, categories, origins }: Props) {
  const t = useTranslations('products');
  const s = useTranslations('setup');
  const { state: shopState } = useSellerShop(shopId);
  const { state, setProduct } = useSellerProduct(shopId, productId);

  if (shopState.status === 'loading' || state.status === 'loading') {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton width="50%" height={32} />
        <Skeleton variant="block" height={400} />
      </div>
    );
  }
  if (shopState.status === 'error')
    return <EmptyState icon="building-store" title={s('notFound')} />;
  if (state.status === 'error') return <EmptyState icon="package" title={t('notFound')} />;

  return (
    <ProductForm
      key={state.product?.id ?? 'new'}
      shop={shopState.shop}
      product={state.product}
      categories={categories}
      origins={origins}
      onSaved={setProduct}
    />
  );
}

type Busy = 'save' | 'publish' | 'hide' | 'draft' | null;

function ProductForm({
  shop,
  product,
  categories,
  origins,
  onSaved,
}: {
  shop: SellerShop;
  product?: SellerProduct;
  categories: ProductCategory[];
  origins: CountryOption[];
  onSaved: (product: SellerProduct) => void;
}) {
  const t = useTranslations('products');
  const s = useTranslations('setup');
  const locale = useLocale() as Locale;
  const errorText = useErrorText();
  const router = useRouter();
  const branchIds = shop.branches.map((b) => b.id);
  const [draft, setDraft] = useState<ProductDraft>(() => draftFromProduct(product));
  const [grid, setGrid] = useState<ListingGrid>(() =>
    listingGrid(product, branchIds, draft.variants),
  );
  const [problem, setProblem] = useState<{ problem: ProductProblem; variant?: number } | null>(
    null,
  );
  const [listingProblem, setListingProblem] = useState<{
    problem: ListingProblem;
    branchId: string;
    key: string;
  } | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const options = productCategories(categories, shop.categoryIds, draft.categoryId);
  const category = categories.find((c) => c.id === draft.categoryId);
  const patch = (p: Partial<ProductDraft>) => setDraft((d) => ({ ...d, ...p }));
  const fail = (text: string) => {
    setMessage({ error: true, text });
    return null;
  };

  /** Saves the product, then where it is sold; the saved product, or null when it failed. */
  const save = async (): Promise<SellerProduct | null> => {
    setMessage(null);
    const built = productBody(draft, category);
    if (!built.ok) {
      setProblem(built);
      return fail(t(`problem${built.problem}`));
    }
    // Checked before saving, with the draft keys standing in for the ids still to come.
    const check = listingsBody(
      grid,
      branchIds,
      draft.variants.map((v) => ({ key: v.key, id: v.key })),
    );
    if (!check.ok) {
      setListingProblem(check);
      return fail(t(`problem${check.problem}`));
    }
    setProblem(null);
    setListingProblem(null);

    const result = product
      ? await productsApi.update(shop.id, product.id, built.body)
      : await productsApi.create(shop.id, built.body);
    if (!result.ok) return fail(errorText(result.code));
    const saved = [...result.data.variants].sort((a, b) => a.sort - b.sort);
    const ids = draft.variants.map((v, i) => ({ key: v.key, id: saved[i].id }));
    const listings = listingsBody(grid, branchIds, ids);
    const listed = listings.ok
      ? await productsApi.setListings(shop.id, result.data.id, listings.listings)
      : null;
    if (listed && !listed.ok) {
      fail(errorText(listed.code));
      return result.data;
    }
    return listed?.ok ? listed.data : result.data;
  };

  /** Shows the saved product; a new one moves to its own address. */
  const show = (saved: SellerProduct, text: string) => {
    if (!product) {
      router.replace(`/shops/${shop.id}/products/${saved.id}`);
      return;
    }
    onSaved(saved);
    const next = draftFromProduct(saved);
    setDraft(next);
    setGrid(listingGrid(saved, branchIds, next.variants));
    setMessage((m) => (m?.error ? m : { error: false, text }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy('save');
    const saved = await save();
    setBusy(null);
    if (saved) show(saved, s('saved'));
  };

  const publish = async () => {
    setBusy('publish');
    const saved = await save();
    if (!saved) return setBusy(null);
    const result = await productsApi.setStatus(shop.id, saved.id, 'active');
    setBusy(null);
    if (!result.ok) {
      show(saved, s('saved'));
      return fail(errorText(result.code));
    }
    show(result.data, result.data.status === 'active' ? t('nowLive') : t('sentForReview'));
  };

  const setStatus = async (status: 'hidden' | 'draft') => {
    if (!product) return;
    setBusy(status === 'hidden' ? 'hide' : 'draft');
    const result = await productsApi.setStatus(shop.id, product.id, status);
    setBusy(null);
    if (!result.ok) return fail(errorText(result.code));
    onSaved(result.data);
    setMessage({ error: false, text: status === 'hidden' ? t('nowHidden') : t('nowDraft') });
  };

  const actions = product ? statusActions(product.status) : ['publish' as const];
  const disabled = busy !== null || uploading;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href={`/shops/${shop.id}/products`}
          className="self-start text-sm font-semibold text-clay-ink"
        >
          {t('allProducts')}
        </Link>
        <h1 className="text-[26px] leading-8 font-bold">
          {product ? pickLocalized(product.title, locale) || t('untitled') : t('newTitle')}
        </h1>
        {product && (
          <div className="flex flex-col gap-2">
            <Badge tone={PRODUCT_TONE[product.status] ?? 'neutral'} className="self-start">
              {t(`status${product.status}`)}
            </Badge>
            <p className="text-sm text-ink-muted">{t(`statusHint${product.status}`)}</p>
            {product.status === 'rejected' && product.reviewReason && (
              <p className="rounded-md bg-danger-soft p-3 text-sm">
                <span className="font-semibold">{t('reviewReason')}</span> {product.reviewReason}
              </p>
            )}
          </div>
        )}
      </div>

      <form onSubmit={submit} noValidate className="flex flex-col gap-8">
        <section className="flex flex-col gap-4" aria-labelledby="product-about">
          <h2 id="product-about" className="text-lg font-semibold">
            {t('about')}
          </h2>
          <Select
            label={t('category')}
            placeholder={t('categoryPlaceholder')}
            options={options.map(({ category: c, parent }) => ({
              value: c.id,
              label: parent
                ? `${pickLocalized(parent.name, locale)} › ${pickLocalized(c.name, locale)}`
                : pickLocalized(c.name, locale),
            }))}
            value={draft.categoryId}
            error={problem?.problem === 'category' ? t('problemcategory') : undefined}
            hint={
              category?.isRestricted || category?.requiresDeclaration
                ? t('reviewedHint')
                : undefined
            }
            onChange={(ev) => patch({ categoryId: ev.target.value })}
          />
          <Input
            label={t('titleEn')}
            placeholder={t('titleEnPlaceholder')}
            dir="ltr"
            maxLength={140}
            value={draft.title.en}
            error={problem?.problem === 'title' ? t('problemtitle') : undefined}
            onChange={(ev) => patch({ title: { ...draft.title, en: ev.target.value } })}
          />
          <Input
            label={t('titleAr')}
            placeholder={t('titleArPlaceholder')}
            dir="rtl"
            maxLength={140}
            value={draft.title.ar}
            onChange={(ev) => patch({ title: { ...draft.title, ar: ev.target.value } })}
          />
          <Input
            label={t('titleFr')}
            optional={s('optional')}
            dir="ltr"
            maxLength={140}
            value={draft.title.fr}
            onChange={(ev) => patch({ title: { ...draft.title, fr: ev.target.value } })}
          />
          <Textarea
            label={t('descriptionEn')}
            optional={s('optional')}
            hint={t('descriptionHint')}
            dir="ltr"
            rows={4}
            maxLength={5000}
            value={draft.description.en}
            onChange={(ev) => patch({ description: { ...draft.description, en: ev.target.value } })}
          />
          <Textarea
            label={t('descriptionAr')}
            optional={s('optional')}
            dir="rtl"
            rows={4}
            maxLength={5000}
            value={draft.description.ar}
            onChange={(ev) => patch({ description: { ...draft.description, ar: ev.target.value } })}
          />
          <Textarea
            label={t('descriptionFr')}
            optional={s('optional')}
            dir="ltr"
            rows={4}
            maxLength={5000}
            value={draft.description.fr}
            onChange={(ev) => patch({ description: { ...draft.description, fr: ev.target.value } })}
          />
          <Select
            label={t('origin')}
            optional={s('optional')}
            hint={t('originHint')}
            placeholder={t('originNone')}
            options={origins.map((c) => ({
              value: c.code,
              label: `${c.flag} ${countryName(c, locale)}`,
            }))}
            value={draft.originCountry}
            onChange={(ev) => patch({ originCountry: ev.target.value })}
            className="max-w-sm"
          />
        </section>

        <ProductPhotos
          shopId={shop.id}
          product={product}
          ids={draft.imageMediaIds}
          onChange={(imageMediaIds) => patch({ imageMediaIds })}
          onBusy={setUploading}
        />

        <VariantsEditor
          draft={draft}
          service={category?.kind === 'service'}
          problem={problem}
          onChange={patch}
        />

        {category?.requiresDeclaration && (
          <FoodDeclaration
            food={draft.food}
            error={problem?.problem === 'declaration' ? t('problemdeclaration') : undefined}
            onChange={(food) => patch({ food: { ...draft.food, ...food } })}
          />
        )}

        <ListingsEditor
          branches={shop.branches}
          variants={draft.variants}
          optionName={draft.optionName}
          grid={grid}
          problem={listingProblem}
          onChange={setGrid}
        />

        {message && (
          <p
            role={message.error ? 'alert' : 'status'}
            className={message.error ? 'text-sm text-danger' : 'text-sm text-success'}
          >
            {message.text}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          {actions.includes('publish') && (
            <Button
              type="button"
              variant="primary"
              disabled={disabled && busy !== 'publish'}
              loading={busy === 'publish'}
              loadingLabel={s('saving')}
              onClick={publish}
            >
              {product?.status === 'rejected' ? t('sendAgain') : t('publish')}
            </Button>
          )}
          <Button
            type="submit"
            variant={actions.includes('publish') ? 'secondary' : 'primary'}
            disabled={disabled && busy !== 'save'}
            loading={busy === 'save'}
            loadingLabel={s('saving')}
          >
            {product ? t('save') : t('saveDraft')}
          </Button>
          {actions.includes('hide') && (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled && busy !== 'hide'}
              loading={busy === 'hide'}
              loadingLabel={s('saving')}
              onClick={() => void setStatus('hidden')}
            >
              {t('hide')}
            </Button>
          )}
          {actions.includes('draft') && (
            <Button
              type="button"
              variant="ghost"
              disabled={disabled && busy !== 'draft'}
              loading={busy === 'draft'}
              loadingLabel={s('saving')}
              onClick={() => void setStatus('draft')}
            >
              {t('backToDraft')}
            </Button>
          )}
        </div>
      </form>

      {product && <RemoveProduct shopId={shop.id} product={product} />}
    </div>
  );
}

/** Removing a product, after a question; its photos go with it. */
function RemoveProduct({ shopId, product }: { shopId: string; product: SellerProduct }) {
  const t = useTranslations('products');
  const locale = useLocale() as Locale;
  const errorText = useErrorText();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    const result = await productsApi.remove(shopId, product.id);
    setBusy(false);
    if (!result.ok) {
      setAsking(false);
      return setError(errorText(result.code));
    }
    router.replace(`/shops/${shopId}/products`);
  };

  return (
    <section
      className="flex flex-col gap-2 border-t border-line pt-6"
      aria-labelledby="remove-product"
    >
      <h2 id="remove-product" className="text-lg font-semibold">
        {t('remove')}
      </h2>
      <p className="text-sm text-ink-muted">{t('removeHint')}</p>
      <Button variant="destructive" className="self-start" onClick={() => setAsking(true)}>
        {t('remove')}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        alert
        tone="danger"
        icon="alert-triangle"
        title={t('removeQuestion', {
          name: pickLocalized(product.title, locale) || t('untitled'),
        })}
        actions={
          <>
            <Button
              variant="destructive"
              loading={busy}
              loadingLabel={t('removing')}
              onClick={remove}
            >
              {t('removeConfirm')}
            </Button>
            <Button variant="secondary" onClick={() => setAsking(false)}>
              {t('keep')}
            </Button>
          </>
        }
      >
        {t('removeBody')}
      </Modal>
    </section>
  );
}
