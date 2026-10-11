import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@am/ui';
import { RequireSession } from '@/components/require-session';

/**
 * Seller dashboard entry, for signed-in people only. Phase 1 adds onboarding, branches,
 * catalogue and contact analytics; creating the first shop is what grants the `seller` role.
 */
export default async function SellerHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  return (
    <RequireSession>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
        <h1 className="text-[28px] leading-9 font-bold">{t('tagline')}</h1>
        <p className="text-ink-muted">{t('steps')}</p>
        <Button variant="primary" className="self-start">
          {t('getStarted')}
        </Button>
      </main>
    </RequireSession>
  );
}
