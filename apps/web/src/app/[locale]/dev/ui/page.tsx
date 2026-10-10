import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { UiShowcase, type ShowcaseStrings } from '@/components/ui-showcase';

/** Not linked from anywhere and never indexed: a reference page for people building screens. */
export const metadata: Metadata = {
  title: 'UI components',
  robots: { index: false, follow: false },
};

/**
 * The showcase copy lives beside the app messages but in its own files, so these strings are
 * never sent to the browser with the rest of the app's messages.
 */
const strings = async (locale: 'en' | 'ar' | 'fr'): Promise<ShowcaseStrings> =>
  (await import(`../../../../../messages/dev-ui/${locale}.json`)).default;

/**
 * Every shared component, in English (left-to-right) beside Arabic (right-to-left), whatever the
 * URL locale is. French is one click away at /fr/dev/ui, where it replaces the English column and
 * catches truncation.
 */
export default async function DevUiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const start = locale === 'fr' ? 'fr' : 'en';
  const [startStrings, arabicStrings] = await Promise.all([strings(start), strings('ar')]);

  return (
    <main className="mx-auto grid max-w-[1200px] gap-6 px-4 py-8 lg:grid-cols-2">
      <UiShowcase locale={start} t={startStrings} />
      <UiShowcase locale="ar" t={arabicStrings} />
    </main>
  );
}
