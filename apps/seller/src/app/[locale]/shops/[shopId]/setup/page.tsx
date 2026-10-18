import { setRequestLocale } from 'next-intl/server';
import { RequireSession } from '@/components/require-session';
import { ShopSetup } from '@/components/setup/shop-setup';
import { categories, originCountries } from '@/lib/catalogue';
import { phoneCountries } from '@/lib/countries';
import { MapsProvider } from '@/lib/maps';

/** Onboarding for an existing shop, at the step in the address or the first one not done. */
export default async function ShopSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; shopId: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { locale, shopId } = await params;
  const { step } = await searchParams;
  setRequestLocale(locale);
  const [categoryList, origins, phones] = await Promise.all([
    categories(locale),
    originCountries(locale),
    phoneCountries(locale),
  ]);
  return (
    <RequireSession>
      <MapsProvider>
        <ShopSetup
          shopId={shopId}
          step={step}
          categories={categoryList}
          origins={origins}
          phoneCountries={phones}
        />
      </MapsProvider>
    </RequireSession>
  );
}
