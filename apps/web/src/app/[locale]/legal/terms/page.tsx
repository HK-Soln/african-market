import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { LEGAL_VERSIONS } from '@am/contracts';
import { LegalDocument, legalText } from '@/components/legal-document';
import { TERMS } from '@/legal/terms';

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  return { title: legalText(TERMS, locale).title };
}

export default async function TermsPage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalDocument text={legalText(TERMS, locale)} version={LEGAL_VERSIONS.terms} />;
}
