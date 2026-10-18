import { getTranslations, setRequestLocale } from 'next-intl/server';
import { RequireSession } from '@/components/require-session';
import { MyShops } from '@/components/shops/my-shops';

/** The seller's home: their shops, or the way to list the first one. */
export default async function SellerHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('shops');
  return (
    <RequireSession>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-2 pb-12">
        <h1 className="text-[28px] leading-9 font-bold">{t('title')}</h1>
        <MyShops />
      </main>
    </RequireSession>
  );
}
