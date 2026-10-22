import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RequireAdmin } from '@/components/require-admin';
import { ShopQueue } from '@/components/shops/shop-queue';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'shops' });
  return { title: t('title') };
}

/** Shops waiting for review, and every other shop by status or name. */
export default async function ShopsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <RequireAdmin>
      <ShopQueue />
    </RequireAdmin>
  );
}
