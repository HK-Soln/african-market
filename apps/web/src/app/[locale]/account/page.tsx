import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AccountScreen } from '@/components/account-screen';

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'accountPage' });
  // Personal: not for search engines.
  return { title: t('title'), robots: { index: false } };
}

export default async function AccountPage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('accountPage');
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
      <h1 className="text-[28px] leading-9 font-bold">{t('title')}</h1>
      <AccountScreen />
    </main>
  );
}
