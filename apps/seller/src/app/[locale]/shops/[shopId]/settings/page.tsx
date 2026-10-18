import { setRequestLocale } from 'next-intl/server';
import { ShopSettings } from '@/components/shops/shop-settings';
import { RequireSession } from '@/components/require-session';

/** The shop and account settings. */
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string; shopId: string }>;
}) {
  const { locale, shopId } = await params;
  setRequestLocale(locale);
  return (
    <RequireSession>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-2 pb-12">
        <ShopSettings shopId={shopId} />
      </main>
    </RequireSession>
  );
}
