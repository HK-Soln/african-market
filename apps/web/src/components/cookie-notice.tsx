'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@am/ui';
import { Link } from '@/i18n/navigation';

/**
 * Says once what the app stores in the browser. Only what the service needs is stored (sign-in
 * cookies, language, the area searched from, these notes), so there is nothing to accept or refuse; if analytics or
 * advertising ever arrive, this becomes a choice asked before they load. Bump the version when
 * the wording changes, so everyone sees it again.
 */
const NOTICE_KEY = 'am.cookie-notice';
const NOTICE_VERSION = '2';

export function CookieNotice() {
  const t = useTranslations('cookies');
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      setShow(window.localStorage.getItem(NOTICE_KEY) !== NOTICE_VERSION);
    } catch {
      // Blocked storage: show it; dismissing only lasts for this page then.
      setShow(true);
    }
  }, []);

  if (!show) return null;
  const dismiss = () => {
    try {
      window.localStorage.setItem(NOTICE_KEY, NOTICE_VERSION);
    } catch {
      // Nothing to do: it shows again on the next visit.
    }
    setShow(false);
  };

  return (
    <section
      aria-label={t('label')}
      className="fixed start-3 end-3 bottom-4 z-[var(--z-sticky)] mx-auto flex max-w-[560px] flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4 shadow-lg sm:flex-row sm:items-center"
    >
      <p className="flex-1 text-[15px] leading-6">
        {t('body')}{' '}
        <Link href="/legal/privacy" className="font-semibold text-clay underline">
          {t('more')}
        </Link>
      </p>
      <Button variant="primary" onClick={dismiss}>
        {t('ok')}
      </Button>
    </section>
  );
}
