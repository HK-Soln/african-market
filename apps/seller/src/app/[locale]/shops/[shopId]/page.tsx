import { setRequestLocale } from 'next-intl/server';
import { RequireSession } from '@/components/require-session';
import { ShopOverview } from '@/components/shops/shop-overview';

/** One shop's dashboard. */
export default async function ShopPage({
  params,
}: {
  params: Promise<{ locale: string; shopId: string }>;
}) {
  const { locale, shopId } = await params;
  setRequestLocale(locale);
  return (
    <RequireSession>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-2 pb-12">
        <ShopOverview shopId={shopId} />
      </main>
    </RequireSession>
  );
}
