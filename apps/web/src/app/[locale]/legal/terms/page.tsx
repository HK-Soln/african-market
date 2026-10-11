import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { LegalPlaceholder } from '@/components/legal-placeholder';

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'legal' });
  return { title: t('termsTitle') };
}

export default async function TermsPage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalPlaceholder title="termsTitle" />;
}
