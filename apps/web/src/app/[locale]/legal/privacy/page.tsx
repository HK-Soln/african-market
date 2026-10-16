import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { LEGAL_VERSIONS } from '@am/contracts';
import { LegalDocument, legalText } from '@/components/legal-document';
import { PRIVACY_POLICY } from '@/legal/privacy';

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  return { title: legalText(PRIVACY_POLICY, locale).title };
}

export default async function PrivacyPage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <LegalDocument text={legalText(PRIVACY_POLICY, locale)} version={LEGAL_VERSIONS.privacy} />
  );
}
