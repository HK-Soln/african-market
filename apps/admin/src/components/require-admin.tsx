'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@am/ui';
import { RequireSession } from '@/components/require-session';
import { useSession } from '@/components/session-provider';

/**
 * Shows its children to a signed-in admin. Anyone else signed in is told why they cannot go
 * further; anyone signed out is sent to sign in. The gateway enforces the same rule on every
 * admin route (`@Roles('admin')`), whatever this shows.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  return (
    <RequireSession>
      <AdminOnly>{children}</AdminOnly>
    </RequireSession>
  );
}

function AdminOnly({ children }: { children: ReactNode }) {
  const t = useTranslations('admin');
  const session = useSession();
  if (session.user?.roles?.includes('admin')) return <>{children}</>;
  return (
    <main className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-2xl font-bold">{t('notAllowed')}</h1>
      <p className="text-ink-muted">{t('notAllowedWhy')}</p>
      <Button onClick={() => void session.signOut()}>{t('signOut')}</Button>
    </main>
  );
}
