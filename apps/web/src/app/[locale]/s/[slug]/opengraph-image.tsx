import { getTranslations } from 'next-intl/server';
import { EMIRATES } from '@am/geo';
import { OG_SIZE, ogCard } from '@/lib/shop/og';
import { getShop } from '@/lib/shop/server';

export const size = OG_SIZE;
export const contentType = 'image/png';
export const revalidate = 3600;
export const alt = 'African Market UAE';

/** The picture when a shop's link is shared. */
export default async function ShopOgImage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { slug } = await params;
  const shop = await getShop('en', slug);
  if (!shop) return ogCard({ title: 'African Market UAE', lines: [] });
  // English, like the rest of the image (see ogCard).
  const t = await getTranslations({ locale: 'en', namespace: 'shop' });
  const emirate = (code: string) => EMIRATES.find((e) => e.code === code)?.name.en ?? code;
  const places = [...new Set(shop.branches.map((b) => b.area ?? emirate(b.emirate)))];
  return ogCard({
    title: shop.name,
    lines: [places.slice(0, 3).join(' · '), t('verified')].filter(Boolean),
    imageUrl: shop.gallery[0]?.card ?? shop.logo?.card ?? null,
  });
}
