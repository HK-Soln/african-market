import { setRequestLocale } from 'next-intl/server';
import { ProductEditor } from '@/components/products/product-editor';
import { RequireSession } from '@/components/require-session';
import { categories, originCountries } from '@/lib/catalogue';

/** Categories and countries come from the gateway on each visit, never baked in at build time. */
export const dynamic = 'force-dynamic';

/** A new product. */
export default async function NewProductPage({
  params,
}: {
  params: Promise<{ locale: string; shopId: string }>;
}) {
  const { locale, shopId } = await params;
  setRequestLocale(locale);
  const [categoryList, origins] = await Promise.all([categories(locale), originCountries(locale)]);
  return (
    <RequireSession>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-2 pb-16">
        <ProductEditor shopId={shopId} categories={categoryList} origins={origins} />
      </main>
    </RequireSession>
  );
}
