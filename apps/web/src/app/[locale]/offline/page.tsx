import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmptyState } from '@am/ui';
import { RetryButton } from '@/components/retry-button';

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'offline' });
  return { title: t('title'), robots: { index: false } };
}

/**
 * Shown by the service worker in place of a page that could not be loaded and was never saved.
 * It is precached at install, so it must not need the network: no data, no remote images.
 * Phase 1 adds the recently viewed shops from the Offline design.
 */
export default async function OfflinePage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('offline');
  return (
    <main className="mx-auto flex max-w-3xl flex-col px-4 py-10">
      <EmptyState
        icon="wifi-off"
        tone="neutral"
        title={t('title')}
        body={t('body')}
        action={<RetryButton>{t('retry')}</RetryButton>}
      />
    </main>
  );
}
