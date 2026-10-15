import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AuthScreen } from '@/components/auth-screen';
import { phoneCountries } from '@/lib/countries';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth' });
  // A sign-in form has nothing for a search engine.
  return { title: t('metaTitle'), robots: { index: false } };
}

/** Admins sign in with their own account; the admin role is what lets them in (RequireAdmin). */
export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { next } = await searchParams;
  const countries = await phoneCountries(locale);
  return (
    <main>
      <AuthScreen next={typeof next === 'string' ? next : undefined} countries={countries} />
    </main>
  );
}
