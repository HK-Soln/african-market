import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { CountriesEditor } from '@/components/countries-editor';
import { RequireAdmin } from '@/components/require-admin';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'countries' });
  return { title: t('title') };
}

/** Which countries new accounts may sign up from by phone, and which are offered as origins. */
export default async function CountriesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <RequireAdmin>
      <CountriesEditor />
    </RequireAdmin>
  );
}
