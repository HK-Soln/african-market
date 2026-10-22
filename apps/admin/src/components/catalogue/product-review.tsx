'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import { formatAed, pickLocalized, textDirection, type Locale } from '@am/i18n';
import { Badge, Button, Card, EmptyState, Select, Skeleton, Toast } from '@am/ui';
import { Link } from '@/i18n/navigation';
import {
  categoryTree,
  priceRange,
  reviewQuery,
  type Category,
  type ReviewProduct,
} from '@/lib/catalogue';
import { catalogueApi } from '@/lib/catalogue-api';
import { shopsApi } from '@/lib/shops';
import { DecisionDialog } from '../decision-dialog';
import { useErrorText } from '../error-text';

/**
 * Products waiting for review (food, restricted categories, and those rejected before), oldest
 * first. Each card has what is needed to decide: photos, words in each language, versions and
 * prices, the food declaration, and the shop it comes from.
 */
export function ProductReview() {
  const t = useTranslations('products');
  const locale = useLocale() as Locale;
  const errorText = useErrorText();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [products, setProducts] = useState<ReviewProduct[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [shopNames, setShopNames] = useState<Map<string, string>>(new Map());
  const [deciding, setDeciding] = useState<{
    product: ReviewProduct;
    decision: 'approve' | 'reject';
  } | null>(null);
  const [done, setDone] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    void catalogueApi.categories().then((r) => r.ok && setCategories(r.data.items));
  }, []);

  const load = useCallback(
    async (cursor?: string) => {
      const result = await catalogueApi.reviewQueue(reviewQuery(categoryId, cursor));
      if (!result.ok) return setError(result.code);
      setError(null);
      setProducts((before) =>
        cursor ? [...(before ?? []), ...result.data.items] : result.data.items,
      );
      setNextCursor(result.data.nextCursor);
    },
    [categoryId],
  );

  useEffect(() => {
    setProducts(null);
    void load();
  }, [load]);

  // The shops' names, one call per shop not seen yet.
  useEffect(() => {
    const missing = [...new Set((products ?? []).map((p) => p.shopId))].filter(
      (id) => !shopNames.has(id),
    );
    if (!missing.length) return;
    void Promise.all(missing.map((id) => shopsApi.verification(id))).then((results) => {
      setShopNames((before) => {
        const next = new Map(before);
        results.forEach((r, i) => next.set(missing[i], r.ok ? r.data.shop.name : ''));
        return next;
      });
    });
  }, [products, shopNames]);

  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  // Only categories whose products are reviewed are worth filtering by.
  const reviewed = useMemo(
    () =>
      categoryTree(categories).filter(
        (r) => r.category.isRestricted || r.category.requiresDeclaration,
      ),
    [categories],
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <p className="text-ink-muted">{t('intro')}</p>
      </header>

      <Select
        label={t('category')}
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        placeholder={t('allCategories')}
        options={reviewed.map((r) => ({
          value: r.category.id,
          label: `${'— '.repeat(r.depth - 1)}${pickLocalized(r.category.name, locale)}`,
        }))}
        className="sm:max-w-sm"
      />

      {error ? (
        <EmptyState
          icon="alert-triangle"
          tone="danger"
          title={errorText(error)}
          action={<Button onClick={() => void load()}>{t('retry')}</Button>}
        />
      ) : !products ? (
        <div className="flex flex-col gap-3" aria-busy>
          {[0, 1].map((i) => (
            <Skeleton key={i} variant="block" height={240} />
          ))}
        </div>
      ) : products.length === 0 ? (
        <EmptyState icon="circle-check" title={t('empty')} />
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {products.map((product) => (
              <li key={product.id}>
                <ProductCard
                  product={product}
                  category={byId.get(product.categoryId)}
                  shopName={shopNames.get(product.shopId)}
                  onDecide={(decision) => setDeciding({ product, decision })}
                />
              </li>
            ))}
          </ul>
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

      <DecisionDialog
        open={deciding !== null}
        onClose={() => setDeciding(null)}
        title={deciding?.decision === 'reject' ? t('rejectTitle') : t('approveTitle')}
        body={deciding?.decision === 'reject' ? t('rejectBody') : t('approveBody')}
        confirm={deciding?.decision === 'reject' ? t('reject') : t('approve')}
        reason={deciding?.decision === 'reject'}
        danger={deciding?.decision === 'reject'}
        onConfirm={async (reason) => {
          const { product, decision } = deciding!;
          const result = await catalogueApi.decideProduct(product.id, decision, reason);
          if (result.ok) {
            setProducts((before) => before?.filter((p) => p.id !== product.id) ?? null);
            setDone(decision);
          }
          return result;
        }}
      />
      {done && (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md">
          <Toast
            tone="success"
            title={done === 'approve' ? t('approved') : t('rejected')}
            onClose={() => setDone(null)}
            closeLabel={t('close')}
          />
        </div>
      )}
    </main>
  );
}

function ProductCard({
  product,
  category,
  shopName,
  onDecide,
}: {
  product: ReviewProduct;
  category?: Category;
  shopName?: string;
  onDecide: (decision: 'approve' | 'reject') => void;
}) {
  const t = useTranslations('products');
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const regions = new Intl.DisplayNames([locale], { type: 'region' });
  const range = priceRange(product.variants);
  const food = product.foodDeclaration;
  const title = pickLocalized(product.title, locale) || t('untitled');

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <Link href={`/shops/${product.shopId}`} className="font-semibold text-clay-ink">
            {shopName || t('shop')}
          </Link>
          {category && <span>· {pickLocalized(category.name, locale)}</span>}
          {category?.isRestricted && <Badge tone="warning">{t('restricted')}</Badge>}
          {category?.requiresDeclaration && <Badge tone="info">{t('food')}</Badge>}
          {product.status === 'rejected' && <Badge tone="rejected">{t('rejectedBefore')}</Badge>}
        </p>
        {product.submittedAt && (
          <p className="text-[13px] text-ink-muted">
            {t('submittedAt', {
              when: format.dateTime(new Date(product.submittedAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Asia/Dubai',
              }),
            })}
          </p>
        )}
      </div>

      {product.images.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto">
          {product.images.map((img, i) => (
            <img
              key={i}
              src={img.card ?? img.thumb}
              alt={t('photoN', { n: i + 1 })}
              className="size-28 shrink-0 rounded-md border border-line object-cover"
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-muted">{t('noPhotos')}</p>
      )}

      {product.reviewReason && (
        <p className="text-sm">
          <span className="text-ink-muted">{t('previousReason')}: </span>
          {product.reviewReason}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {(['en', 'ar', 'fr'] as const).map((lang) => (
          <div key={lang} className="flex flex-col gap-1">
            <h3 className="text-sm text-ink-muted">{t(`language.${lang}`)}</h3>
            <p lang={lang} dir={textDirection(lang)} className="font-semibold">
              {product.title[lang] || '—'}
            </p>
            {product.description[lang] && (
              <p
                lang={lang}
                dir={textDirection(lang)}
                className="line-clamp-4 whitespace-pre-line text-sm"
              >
                {product.description[lang]}
              </p>
            )}
          </div>
        ))}
      </div>

      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
        <dt className="text-ink-muted">{t('price')}</dt>
        <dd>
          {!range
            ? t('onRequest')
            : range.min === range.max
              ? formatAed(range.min, locale)
              : `${formatAed(range.min, locale)} – ${formatAed(range.max, locale)}`}
          {product.variants.length > 1 && ` · ${t('versions', { n: product.variants.length })}`}
        </dd>
        {product.originCountry && (
          <>
            <dt className="text-ink-muted">{t('origin')}</dt>
            <dd>{regions.of(product.originCountry) ?? product.originCountry}</dd>
          </>
        )}
        {food && (
          <>
            <dt className="text-ink-muted">{t('declaration')}</dt>
            <dd className="flex flex-col gap-1">
              <span>{t('declared')}</span>
              <span>{t(`storage.${food.storage}`)}</span>
              {food.manufacturer && (
                <span>
                  {t('manufacturer')}: {food.manufacturer}
                </span>
              )}
              {food.registrationNumber ? (
                <span>
                  {t('registration')}: <span dir="ltr">{food.registrationNumber}</span>
                </span>
              ) : (
                <span className="text-ink-muted">{t('noRegistration')}</span>
              )}
            </dd>
          </>
        )}
        {category?.requiresDeclaration && !food && (
          <>
            <dt className="text-ink-muted">{t('declaration')}</dt>
            <dd>
              <Badge tone="danger">{t('noDeclaration')}</Badge>
            </dd>
          </>
        )}
      </dl>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <Button variant="primary" onClick={() => onDecide('approve')}>
          {t('approve')}
        </Button>
        <Button onClick={() => onDecide('reject')}>{t('reject')}</Button>
      </div>
    </Card>
  );
}
