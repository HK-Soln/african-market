import { getLocale, getTranslations } from 'next-intl/server';
import { pickLocalized, type Locale } from '@am/i18n';
import { countryName, OriginBadge, Price, ProductCard, type CountryOption } from '@am/ui';
import { Link } from '@/i18n/navigation';
import type { Category } from '@/lib/search/server';
import { productPath } from '@/lib/shop/paths';
import type { Product } from '@/lib/shop/server';

/** The lowest price and whether variants differ (shown as "From"). */
export function priceOf(product: Product): { fils: number; from: boolean } | null {
  const prices = product.variants
    .map((v) => v.priceFils)
    .filter((p): p is number => typeof p === 'number');
  if (prices.length === 0) return null;
  const low = Math.min(...prices);
  return { fils: low, from: prices.some((p) => p !== low) };
}

/** A physical product no branch has in stock (services have no stock). */
export const isOutOfStock = (product: Product) =>
  product.type === 'product' && !product.listings.some((l) => l.inStock);

/** The shop's products in sections by category, in the catalogue's category order. */
export async function ProductGrid({
  products,
  categories,
  countries,
}: {
  products: Product[];
  categories: Category[];
  countries: CountryOption[];
}) {
  const t = await getTranslations('shop');
  const locale = (await getLocale()) as Locale;
  const order = new Map(categories.map((c, i) => [c.id, i]));
  const names = new Map(categories.map((c) => [c.id, pickLocalized(c.name, locale)]));
  const country = (code: string) => countries.find((c) => c.code === code);

  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const key = names.has(product.categoryId) ? product.categoryId : '';
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }
  const sections = [...groups.entries()].sort(
    ([a], [b]) => (order.get(a) ?? Infinity) - (order.get(b) ?? Infinity),
  );

  return (
    <div className="flex flex-col gap-6">
      {sections.map(([categoryId, items]) => (
        <section key={categoryId || 'other'} className="flex flex-col gap-3">
          <h3 className="text-base font-semibold">{names.get(categoryId) ?? t('otherCategory')}</h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map((product) => {
              const price = priceOf(product);
              const origin = product.originCountry ? country(product.originCountry) : undefined;
              const out = isOutOfStock(product);
              return (
                <li key={product.id}>
                  <ProductCard
                    title={pickLocalized(product.title, locale)}
                    href={productPath(product.id, product.title)}
                    linkAs={Link}
                    imageUrl={product.images[0]?.card ?? product.images[0]?.thumb}
                    outOfStock={out}
                    subtitle={out ? t('outOfStock') : undefined}
                    origin={
                      origin ? (
                        <OriginBadge country={origin} locale={locale}>
                          {countryName(origin, locale)}
                        </OriginBadge>
                      ) : undefined
                    }
                    price={
                      price ? (
                        <Price
                          amount={price.fils / 100}
                          from={price.from ? t('priceFrom') : undefined}
                        />
                      ) : (
                        <span className="text-sm text-ink-muted">{t('priceOnRequest')}</span>
                      )
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
