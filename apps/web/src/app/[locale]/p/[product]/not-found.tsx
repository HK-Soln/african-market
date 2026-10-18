import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@am/ui';
import { Link } from '@/i18n/navigation';

/** No active product by that id, or its shop is no longer listed. */
export default async function ProductNotFound() {
  const t = await getTranslations('product');
  const s = await getTranslations('shop');
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <EmptyState
        icon="package"
        title={t('notFoundTitle')}
        body={t('notFoundBody')}
        action={
          <Link href="/search" className="am-btn am-btn-primary">
            {s('backToSearch')}
          </Link>
        }
      />
    </main>
  );
}
