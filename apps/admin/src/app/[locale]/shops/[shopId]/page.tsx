import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RequireAdmin } from '@/components/require-admin';
import { ShopReview } from '@/components/shops/shop-review';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'review' });
  return { title: t('metaTitle') };
}

/** One shop's verification: identity, licence, page, branches, history and the decision. */
export default async function ShopReviewPage({
  params,
}: {
  params: Promise<{ locale: string; shopId: string }>;
}) {
  const { locale, shopId } = await params;
  setRequestLocale(locale);
  return (
    <RequireAdmin>
      <ShopReview shopId={shopId} />
    </RequireAdmin>
  );
}
