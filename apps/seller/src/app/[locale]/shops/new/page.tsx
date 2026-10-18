import { setRequestLocale } from 'next-intl/server';
import { RequireSession } from '@/components/require-session';
import { NewShop } from '@/components/setup/new-shop';
import { categories, originCountries } from '@/lib/catalogue';

/** Categories and countries come from the gateway on each visit, never baked in at build time. */
export const dynamic = 'force-dynamic';

/** Onboarding's first step for a new shop: creating it is what makes someone a seller. */
export default async function NewShopPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [categoryList, origins] = await Promise.all([categories(locale), originCountries(locale)]);
  return (
    <RequireSession>
      <NewShop categories={categoryList} origins={origins} />
    </RequireSession>
  );
}
