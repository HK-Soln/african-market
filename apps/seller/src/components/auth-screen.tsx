'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { EMIRATES } from '@am/geo';
import { isLocale, type Locale } from '@am/i18n';
import {
  AUTH_LABEL_KEYS,
  AuthFlow,
  safeNextPath,
  type AuthLabels,
  type CountryOption,
  type SocialConfig,
} from '@am/ui';
import { useSession } from '@/components/session-provider';
import { useRouter } from '@/i18n/navigation';
import { auth } from '@/lib/browser-api';
import { config } from '@/lib/config';

/** The customer site: where the Terms and Privacy policy live, and where "Not now" leads. */
const WEB_URL = config.webUrl;

/** Values every error message may use, so a missing detail never breaks the sentence. */
const DETAIL_DEFAULTS = { attemptsLeft: 0, minLength: 10, retryAfterSeconds: 30 };

/** The sign-in screens from `@am/ui`, given this app's words, API calls and navigation. */
export function AuthScreen({
  next,
  countries,
  social,
}: {
  next?: string;
  countries: CountryOption[];
  social?: SocialConfig;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('auth');
  const errors = useTranslations('errors');
  const emirate = useTranslations('emirates');
  const router = useRouter();
  const session = useSession();
  const target = safeNextPath(next);
  /** Set once this screen has signed someone in and is already navigating away. */
  const leaving = useRef(false);

  const labels = useMemo(
    () => Object.fromEntries(AUTH_LABEL_KEYS.map((key) => [key, t(key)])) as AuthLabels,
    [t],
  );
  const emirates = useMemo(
    () => EMIRATES.map(({ code }) => ({ value: code, label: emirate(code) })),
    [emirate],
  );

  // Someone already signed in has no business here.
  useEffect(() => {
    if (session.status === 'signed-in' && !leaving.current) router.replace(target);
  }, [session.status, router, target]);

  return (
    <AuthFlow
      actions={auth}
      labels={labels}
      locale={locale}
      emirates={emirates}
      countries={countries}
      social={social}
      termsHref={`${WEB_URL}/${locale}/legal/terms`}
      privacyHref={`${WEB_URL}/${locale}/legal/privacy`}
      errorText={(code, details) =>
        errors.has(code)
          ? errors(code, { ...DETAIL_DEFAULTS, ...numbersOnly(details) })
          : errors('UNKNOWN')
      }
      // Every seller page needs an account, so declining goes back to the customer site.
      onClose={() => window.location.assign(`${WEB_URL}/${locale}`)}
      onDone={(user) => {
        leaving.current = true;
        session.setUser(user);
        // The account's language wins over the one the page happened to be in.
        const language = isLocale(user.preferredLanguage) ? user.preferredLanguage : locale;
        router.replace(target, { locale: language });
      }}
    />
  );
}

function numbersOnly(details?: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(details ?? {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number',
    ),
  );
}
