import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Card, Icon } from '@am/ui';
import { Link } from '@/i18n/navigation';
import { RequireAdmin } from '@/components/require-admin';
import { AREA_ICONS, AREAS } from '@/lib/areas';

/** The console's start: one card per area, with what is done there. */
export default async function AdminHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('home');
  const nav = await getTranslations('nav');
  return (
    <RequireAdmin>
      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-ink-muted">{t('tagline')}</p>
        </header>
        <ul className="grid gap-3 sm:grid-cols-2">
          {AREAS.map((area) => (
            <li key={area}>
              <Link href={`/${area}`} className="block h-full">
                <Card className="flex h-full items-start gap-3 p-4">
                  <Icon name={AREA_ICONS[area]} className="mt-0.5 shrink-0 text-clay" />
                  <span className="flex flex-col gap-1">
                    <span className="font-semibold">{nav(area)}</span>
                    <span className="text-sm text-ink-muted">{t(`${area}Hint`)}</span>
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </RequireAdmin>
  );
}
