import { setRequestLocale } from 'next-intl/server';
import { ContactInsights } from '@/components/insights/contact-insights';
import { RequireSession } from '@/components/require-session';

/** How customers contacted the shop. */
export default async function InsightsPage({
  params,
}: {
  params: Promise<{ locale: string; shopId: string }>;
}) {
  const { locale, shopId } = await params;
  setRequestLocale(locale);
  return (
    <RequireSession>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-2 pb-12">
        <ContactInsights shopId={shopId} />
      </main>
    </RequireSession>
  );
}
