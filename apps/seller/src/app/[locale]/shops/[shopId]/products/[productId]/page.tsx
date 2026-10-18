import { setRequestLocale } from 'next-intl/server';
import { ProductEditor } from '@/components/products/product-editor';
import { RequireSession } from '@/components/require-session';
import { categories, originCountries } from '@/lib/catalogue';

/** One product: its details, photos, prices, where it is sold, and its status. */
export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; shopId: string; productId: string }>;
}) {
  const { locale, shopId, productId } = await params;
  setRequestLocale(locale);
  const [categoryList, origins] = await Promise.all([categories(locale), originCountries(locale)]);
  return (
    <RequireSession>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-2 pb-16">
        <ProductEditor
          shopId={shopId}
          productId={productId}
          categories={categoryList}
          origins={origins}
        />
      </main>
    </RequireSession>
  );
}
