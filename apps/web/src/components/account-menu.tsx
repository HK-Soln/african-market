'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BottomSheet, Button, IconButton } from '@am/ui';
import { useSession } from '@/components/session-provider';
import { Link, usePathname, useRouter } from '@/i18n/navigation';

/**
 * Header control. A visitor gets "Sign in"; someone signed in gets a button that opens a sheet
 * with their name and "Sign out". On a phone it is an icon only: the header also holds the logo
 * and the language switcher, and all three do not fit in words.
 */
export function AccountMenu() {
  const t = useTranslations('account');
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Nothing until the session is known, so the header does not flash the wrong state.
  if (session.status === 'loading' || pathname === '/sign-in') return null;

  if (session.status === 'signed-out') {
    const signIn = () => router.push({ pathname: '/sign-in', query: { next: pathname } });
    return (
      <>
        {/* Wrapped, because the button styles set their own `display`. */}
        <span className="sm:hidden">
          <IconButton icon="user" label={t('signIn')} onClick={signIn} />
        </span>
        <span className="max-sm:hidden">
          <Button variant="ghost" size="sm" iconStart="user" onClick={signIn}>
            {t('signIn')}
          </Button>
        </span>
      </>
    );
  }

  const name = session.user?.name?.trim();
  return (
    <>
      <IconButton
        icon="user"
        label={name ? `${t('account')}: ${name}` : t('account')}
        variant="secondary"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      />
      <BottomSheet
        title={name || t('account')}
        closeLabel={t('close')}
        open={open}
        onClose={() => setOpen(false)}
        footer={
          <div className="flex flex-col gap-3">
            <Link
              href="/account"
              className="text-center font-semibold text-clay underline"
              onClick={() => setOpen(false)}
            >
              {t('yourData')}
            </Link>
            <Button
              fullWidth
              loading={leaving}
              loadingLabel={t('signingOut')}
              onClick={async () => {
                setLeaving(true);
                await session.signOut();
                setLeaving(false);
                setOpen(false);
                router.refresh();
              }}
            >
              {t('signOut')}
            </Button>
          </div>
        }
      />
    </>
  );
}
