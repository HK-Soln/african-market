import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { EmiratesSearch } from '@/components/catalogue/emirates-search';
import { RequireAdmin } from '@/components/require-admin';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'emiratesSearch' });
  return { title: t('title') };
}

/** Customer search per emirate, and the search index rebuild. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <RequireAdmin>
      <EmiratesSearch />
    </RequireAdmin>
  );
}
