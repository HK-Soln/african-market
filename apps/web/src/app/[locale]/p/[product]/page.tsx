import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { formatAed, pickLocalized, type Locale } from '@am/i18n';
import { Icon, OriginBadge, Price } from '@am/ui';
import { ContactActions } from '@/components/shop/contact-actions';
import { Gallery } from '@/components/shop/gallery';
import { priceOf } from '@/components/shop/product-grid';
import { ReportLink, SellerDetails } from '@/components/shop/seller-details';
import { Link } from '@/i18n/navigation';
import { config } from '@/lib/config';
import { originCountries } from '@/lib/search/server';
import { jsonLdText, productJsonLd } from '@/lib/shop/json-ld';
import {
  alternates,
  parseProductSegment,
  productPath,
  productSlug,
  shopPath,
} from '@/lib/shop/paths';
import { getProduct, getShopById, type Product } from '@/lib/shop/server';

export const revalidate = 60;

/** None at build time: each product page is rendered on its first visit, then cached. */
export function generateStaticParams() {
  return [];
}

type Params = Promise<{ locale: string; product: string }>;

/** The product and its shop, or null (the page is then a 404). */
async function load(locale: string, segment: string) {
  const parsed = parseProductSegment(segment);
  if (!parsed) return null;
  const product = await getProduct(locale, parsed.id);
  if (!product) return null;
  const shop = await getShopById(locale, product.shopId);
  if (!shop) return null;
  return { parsed, product, shop };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, product: segment } = await params;
  const found = await load(locale, segment);
  if (!found) return {};
  const { product, shop } = found;
  const t = await getTranslations({ locale, namespace: 'product' });
  const title = pickLocalized(product.title, locale as Locale);
  const description =
    pickLocalized(product.description, locale as Locale) || t('soldBy', { shop: shop.name });
  const path = productPath(product.id, product.title);
  return {
    title: `${title} · ${shop.name}`,
    description: description.slice(0, 200),
    alternates: alternates(locale, path),
    openGraph: { type: 'website', title, description, url: `/${locale}${path}` },
  };
}

/** A product's page (F1-12): photos, price, what it is, where to get it, and how to ask. */
export default async function ProductPage({ params }: { params: Params }) {
  const { locale, product: segment } = await params;
  setRequestLocale(locale);
  const found = await load(locale, segment);
  if (!found) notFound();
  const { parsed, product, shop } = found;
  // One address per product: an old or shortened slug moves to the current one.
  if (parsed.slug !== productSlug(product.title)) {
    permanentRedirect(`/${locale}${productPath(product.id, product.title)}`);
  }

  const [t, s, e, countries] = await Promise.all([
    getTranslations('product'),
    getTranslations('shop'),
    getTranslations('emirates'),
    originCountries(locale),
  ]);
  const loc = locale as Locale;
  const title = pickLocalized(product.title, loc);
  const description = pickLocalized(product.description, loc);
  const url = `${config.webUrl}/${locale}${productPath(product.id, product.title)}`;
  const price = priceOf(product);
  const origin = countries.find((c) => c.code === product.originCountry);
  const message = t('whatsappAbout', { shop: shop.name, product: title, url });

  // Branches that have it, else (a service) every branch.
  const stocked = new Set(product.listings.filter((l) => l.inStock).map((l) => l.branchId));
  const where =
    product.type === 'service' ? shop.branches : shop.branches.filter((b) => stocked.has(b.id));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-2 pb-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdText(productJsonLd(product, shop, url, loc)) }}
      />
      <Link href={shopPath(shop.slug)} className="text-sm font-semibold text-clay-ink">
        {t('soldBy', { shop: shop.name })}
      </Link>
      <Gallery images={product.images} label={title} aspect="1 / 1" />

      <header className="flex flex-col gap-2">
        <h1 className="text-[26px] leading-8 font-bold">{title}</h1>
        {origin && <OriginBadge country={origin} locale={loc} className="self-start" />}
        {price ? (
          <Price
            size="lg"
            amount={price.fils / 100}
            from={price.from ? s('priceFrom') : undefined}
          />
        ) : (
          <p className="text-ink-muted">{s('priceOnRequest')}</p>
        )}
      </header>

      <Variants product={product} locale={loc} />

      {description && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t('description')}</h2>
          <p className="whitespace-pre-line text-[15px] leading-6">{description}</p>
        </section>
      )}

      {product.foodDeclaration && (
        <section className="flex flex-col gap-1 text-sm">
          <h2 className="text-lg font-semibold">{t('food')}</h2>
          <p>{t(`storage${product.foodDeclaration.storage}`)}</p>
          {product.foodDeclaration.manufacturer && (
            <p>{t('manufacturer', { name: product.foodDeclaration.manufacturer })}</p>
          )}
          {product.foodDeclaration.registrationNumber && (
            <p>
              {t('registration')} <bdi dir="ltr">{product.foodDeclaration.registrationNumber}</bdi>
            </p>
          )}
          <p className="text-ink-muted">{t('packaged')}</p>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('availability')}</h2>
        {product.type === 'service' && <p className="text-sm text-ink-muted">{t('service')}</p>}
        {where.length === 0 ? (
          <>
            <p className="text-sm text-ink-muted">{t('notInStock')}</p>
            <ContactActions
              shopId={shop.id}
              productId={product.id}
              whatsapp={shop.contactWhatsapp}
              phone={shop.contactPhone}
              message={message}
            />
          </>
        ) : (
          where.map((branch) => (
            <article
              key={branch.id}
              className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4"
            >
              <div className="flex flex-col gap-1">
                <h3 className="font-semibold">{branch.name}</h3>
                <p className="flex items-center gap-1 text-sm text-ink-muted">
                  <Icon name="map-pin" size={16} />
                  {[branch.area, e(branch.emirate)].filter(Boolean).join(', ')}
                  {product.type === 'product' && (
                    <span className="text-success"> · {t('inStockAt')}</span>
                  )}
                </p>
              </div>
              <ContactActions
                shopId={shop.id}
                branchId={branch.id}
                productId={product.id}
                whatsapp={branch.contactWhatsapp ?? shop.contactWhatsapp}
                phone={branch.contactPhone ?? shop.contactPhone}
                message={message}
              />
            </article>
          ))
        )}
      </section>

      <SellerDetails shop={shop} />
      <ReportLink query={{ product: product.id }} label={t('report')} />
    </main>
  );
}

/** Each option set with its price, when there is more than one. */
async function Variants({ product, locale }: { product: Product; locale: Locale }) {
  if (product.variants.length < 2) return null;
  const t = await getTranslations('product');
  const s = await getTranslations('shop');
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold">{t('options')}</h2>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
        {[...product.variants]
          .sort((a, b) => a.sort - b.sort)
          .map((variant) => (
            <li key={variant.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span>
                {Object.entries(variant.options)
                  .map(([name, value]) => `${name}: ${value}`)
                  .join(', ') || '–'}
              </span>
              <span className="font-semibold">
                {variant.priceFils === null ? (
                  s('priceOnRequest')
                ) : (
                  <bdi dir="ltr">{formatAed(variant.priceFils, locale)}</bdi>
                )}
              </span>
            </li>
          ))}
      </ul>
    </section>
  );
}
