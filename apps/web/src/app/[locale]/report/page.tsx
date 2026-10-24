import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { pickLocalized, type Locale } from '@am/i18n';
import { ReportForm, type ReportedListing } from '@/components/report-form';
import { productPath, shopPath } from '@/lib/shop/paths';
import { getProduct, getShop, getShopById } from '@/lib/shop/server';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'report' });
  return { title: t('metaTitle'), robots: { index: false } };
}

const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What `?shop=<slug>` or `?product=<id>` names, if it is public. */
async function listing(
  locale: string,
  query: Record<string, string | string[] | undefined>,
): Promise<ReportedListing | null> {
  const slug = one(query.shop);
  if (slug) {
    const shop = await getShop(locale, slug);
    return shop && { kind: 'shop', id: shop.id, name: shop.name, href: shopPath(shop.slug) };
  }
  const productId = one(query.product);
  if (productId && UUID.test(productId)) {
    const product = await getProduct(locale, productId);
    const shop = product && (await getShopById(locale, product.shopId));
    if (!product || !shop) return null;
    return {
      kind: 'product',
      id: product.id,
      name: pickLocalized(product.title, locale as Locale),
      shopName: shop.name,
      href: productPath(product.id, product.title),
    };
  }
  return null;
}

/** Report a shop or a product to the team (F1-15); linked from both pages. */
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const found = await listing(locale, await searchParams);
  if (!found) notFound();
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8">
      <ReportForm listing={found} />
    </main>
  );
}
