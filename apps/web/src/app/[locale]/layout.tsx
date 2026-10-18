import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { textDirection, type Locale } from '@am/i18n';
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar';
import { AccountMenu } from '@/components/account-menu';
import { CookieNotice } from '@/components/cookie-notice';
import { InstallPrompt } from '@/components/install-prompt';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SessionProvider } from '@/components/session-provider';
import { SiteFooter } from '@/components/site-footer';
import { routing } from '@/i18n/routing';
import { config } from '@/lib/config';
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
    metadataBase: new URL(config.webUrl),
    title: { default: t('title'), template: `%s · ${t('title')}` },
    description: t('description'),
    manifest: '/manifest.webmanifest',
    icons: { apple: '/icons/apple-touch-icon.png' },
    // iOS: open from the home screen without Safari's bars, under this name.
    appleWebApp: { capable: true, title: t('title'), statusBarStyle: 'default' },
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
          <SessionProvider>
            <header className="flex min-h-16 items-center justify-between gap-3 px-4 py-2">
              {/* The wordmark needs more room than a phone header has beside the other controls. */}
              <span className="sm:hidden">
                <Logo variant="mark" size={36} />
              </span>
              <span className="max-sm:hidden">
                <Logo size={32} />
              </span>
              <div className="flex items-center gap-2">
                <AccountMenu />
                <LanguageSwitcher />
              </div>
            </header>
            {children}
            <SiteFooter />
            <InstallPrompt />
            <CookieNotice />
          </SessionProvider>
          <ServiceWorkerRegistrar />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
