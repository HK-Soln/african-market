import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { textDirection, type Locale } from '@am/i18n';
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar';
import { LanguageSwitcher } from '@/components/language-switcher';
import { routing } from '@/i18n/routing';
import { Logo } from '@am/ui';
import { fontVariables } from '../fonts';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'meta' });
  return {
    title: { default: t('title'), template: `%s · ${t('title')}` },
    description: t('description'),
    manifest: '/manifest.webmanifest',
  };
}

export const viewport: Viewport = { themeColor: '#a9500e', width: 'device-width', initialScale: 1 };

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} dir={textDirection(locale as Locale)} className={fontVariables}>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <header className="flex items-center justify-between gap-3 px-4 py-3">
            <Logo size={32} />
            <LanguageSwitcher />
          </header>
          {children}
          <ServiceWorkerRegistrar />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
