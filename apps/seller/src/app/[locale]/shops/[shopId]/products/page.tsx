import { setRequestLocale } from 'next-intl/server';
import { ProductList } from '@/components/products/product-list';
import { RequireSession } from '@/components/require-session';

/** A shop's catalogue. */
export default async function ProductsPage({
  params,
}: {
  params: Promise<{ locale: string; shopId: string }>;
}) {
  const { locale, shopId } = await params;
  setRequestLocale(locale);
  return (
    <RequireSession>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-2 pb-12">
        <ProductList shopId={shopId} />
      </main>
    </RequireSession>
  );
}
