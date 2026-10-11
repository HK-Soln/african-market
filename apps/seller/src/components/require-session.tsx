'use client';

import { useEffect, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Skeleton } from '@am/ui';
import { useSession } from '@/components/session-provider';
import { usePathname, useRouter } from '@/i18n/navigation';

/**
 * Shows its children to someone signed in and sends everyone else to sign in, then back here.
 * This only decides what the browser shows: the gateway refuses the data itself without a
 * session, whatever the page does.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const t = useTranslations('account');
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (session.status === 'signed-out') {
      router.replace({ pathname: '/sign-in', query: { next: pathname } });
    }
  }, [session.status, router, pathname]);

  if (session.status !== 'signed-in') {
    return (
      <div
        className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-10"
        role="status"
        aria-label={t('checking')}
      >
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-12 w-40" />
      </div>
    );
  }
  return <>{children}</>;
}
