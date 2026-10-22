'use client';

import { useTranslations } from 'next-intl';
import { cx } from '@am/ui';
import { useSession } from '@/components/session-provider';
import { Link, usePathname } from '@/i18n/navigation';
import { AREAS } from '@/lib/areas';

/**
 * The console's sections, under the header, for admins only. Scrolls sideways on a phone rather
 * than wrapping, so it stays one line.
 */
export function AdminNav() {
  const t = useTranslations('nav');
  const session = useSession();
  const pathname = usePathname();
  if (!session.user?.roles?.includes('admin')) return null;

  return (
    <nav aria-label={t('label')} className="border-b border-line">
      <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
        {AREAS.map((area) => {
          const current = pathname === `/${area}` || pathname.startsWith(`/${area}/`);
          return (
            <li key={area} className="shrink-0">
              <Link
                href={`/${area}`}
                aria-current={current ? 'page' : undefined}
                className={cx(
                  'block border-b-2 px-3 py-3 text-sm font-semibold',
                  current
                    ? 'border-clay text-clay-ink'
                    : 'border-transparent text-ink-muted hover:text-ink',
                )}
              >
                {t(area)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
