'use client';

import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, IconButton, Logo } from '@am/ui';
import { usePathname } from '@/i18n/navigation';

/** Chrome and Edge fire this when the site can be installed; it is not in the DOM typings. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'am.install-dismissed';
/** After "Not now", stay quiet for this long before offering again. */
const QUIET_MS = 30 * 24 * 60 * 60 * 1000;

const recentlyDismissed = () => {
  try {
    return Date.now() - Number(window.localStorage.getItem(DISMISSED_KEY) ?? 0) < QUIET_MS;
  } catch {
    return false;
  }
};

/**
 * The "Add to your home screen" card from the Install design. It appears only when the browser
 * says the site can be installed, never over the sign-in screens, and not again for a month
 * after "Not now". Safari on iOS has no such event; people there install from the Share menu.
 */
export function InstallPrompt() {
  const t = useTranslations('install');
  const pathname = usePathname();
  const titleId = useId();
  const [offer, setOffer] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onOffer = (event: Event) => {
      // Stops the browser's own mini-bar, so the choice is made in our words.
      event.preventDefault();
      if (!recentlyDismissed()) setOffer(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setOffer(null);
    window.addEventListener('beforeinstallprompt', onOffer);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onOffer);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!offer || pathname === '/sign-in') return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Storage is blocked: the card simply comes back on the next visit.
    }
    setOffer(null);
  };

  return (
    <section
      aria-labelledby={titleId}
      className="fixed start-3 end-3 bottom-4 z-40 mx-auto flex max-w-[420px] flex-col gap-3 rounded-lg border border-line bg-surface-raised p-3.5 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <Logo variant="mark" size={44} />
        <div className="flex grow flex-col gap-0.5 pt-0.5">
          <h2 id={titleId} className="text-base leading-[1.4] font-bold">
            {t('title')}
          </h2>
          <p className="text-sm leading-normal text-ink-muted">{t('body')}</p>
        </div>
        <IconButton icon="x" label={t('close')} onClick={dismiss} />
      </div>
      <div className="flex gap-2">
        <Button
          variant="primary"
          iconStart="plus"
          className="grow"
          onClick={async () => {
            await offer.prompt();
            const { outcome } = await offer.userChoice;
            // A prompt can be used once; either way this card is finished.
            if (outcome === 'dismissed') dismiss();
            else setOffer(null);
          }}
        >
          {t('install')}
        </Button>
        <Button variant="ghost" onClick={dismiss}>
          {t('later')}
        </Button>
      </div>
    </section>
  );
}
