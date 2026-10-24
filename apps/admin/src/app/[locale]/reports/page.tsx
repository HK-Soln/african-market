import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ReportsQueue } from '@/components/reports-queue';
import { RequireAdmin } from '@/components/require-admin';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'reports' });
  return { title: t('title') };
}

/** Customers' reports on shops and products, open ones oldest first. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <RequireAdmin>
      <ReportsQueue />
    </RequireAdmin>
  );
}
