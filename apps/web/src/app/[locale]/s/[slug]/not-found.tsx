import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@am/ui';
import { Link } from '@/i18n/navigation';

/** No verified shop by that slug: it closed, was suspended, or the link is wrong. */
export default async function ShopNotFound() {
  const t = await getTranslations('shop');
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <EmptyState
        icon="building-store"
        title={t('notFoundTitle')}
        body={t('notFoundBody')}
        action={
          <Link href="/search" className="am-btn am-btn-primary">
            {t('backToSearch')}
          </Link>
        }
      />
    </main>
  );
}
