import { formatAed, pickLocalized } from '@am/i18n';
import { OG_SIZE, ogCard } from '@/lib/shop/og';
import { parseProductSegment } from '@/lib/shop/paths';
import { getProduct, getShopById } from '@/lib/shop/server';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const revalidate = 3600;
export const alt = 'African Market UAE';

/** The picture when a product's link is shared: its photo, name, price and shop. */
export default async function ProductOgImage({
  params,
}: {
  params: Promise<{ locale: string; product: string }>;
}) {
  const { product: segment } = await params;
  const parsed = parseProductSegment(segment);
  const product = parsed ? await getProduct('en', parsed.id) : null;
  const shop = product ? await getShopById('en', product.shopId) : null;
  if (!product || !shop) return ogCard({ title: 'African Market UAE', lines: [] });
  const prices = product.variants
    .map((v) => v.priceFils)
    .filter((p): p is number => typeof p === 'number');
  return ogCard({
    title: pickLocalized(product.title, 'en'),
    lines: [prices.length ? formatAed(Math.min(...prices), 'en') : '', shop.name].filter(Boolean),
    imageUrl: product.images[0]?.card ?? null,
  });
}
