'use client';

import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@am/i18n';
import { Button } from '../button';

/** The social sign-in switched on, from `GET /api/v1/auth/social/providers`. */
export interface SocialConfig {
  google?: { clientId: string } | null;
  facebook?: { appId: string } | null;
}

export type SocialProviderName = 'google' | 'facebook';

/* The two providers' browser SDKs, as far as these buttons use them. */
interface GoogleIdentity {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
        ux_mode?: 'popup' | 'redirect';
        use_fedcm_for_prompt?: boolean;
      }): void;
      renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
    };
  };
}

interface FacebookSdk {
  init(options: { appId: string; version: string; cookie: boolean; xfbml: boolean }): void;
  login(
    callback: (response: { authResponse?: { accessToken?: string } | null }) => void,
    options: { scope: string },
  ): void;
}

declare global {
  interface Window {
    google?: GoogleIdentity;
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

const FACEBOOK_GRAPH_VERSION = 'v23.0';

/** Adds a provider's script once; resolves when it has loaded. */
function loadScript(id: string, src: string): Promise<void> {
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  if (existing?.dataset.loaded === 'true') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement('script');
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    });
    script.addEventListener('error', () => reject(new Error(`${src} did not load`)));
    if (!existing) {
      script.id = id;
      script.src = src;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });
}

/** Facebook's SDK names its locales en_US, ar_AR, fr_FR. */
const facebookLocale = (locale: Locale) =>
  ({ en: 'en_US', ar: 'ar_AR', fr: 'fr_FR' })[locale] ?? 'en_US';

export interface SocialButtonsProps {
  config: SocialConfig;
  locale: Locale;
  labels: { continueWithGoogle: string; continueWithFacebook: string };
  /** A provider gave a token; the flow sends it to the server. */
  onToken: (provider: SocialProviderName, token: string) => void;
  /** The provider's script could not load or the person closed its window. */
  onUnavailable?: (provider: SocialProviderName) => void;
  busy?: boolean;
}

/**
 * "Continue with Google" (Google's own button, as its brand rules ask) and "Continue with
 * Facebook". Each provider's script loads only when that provider is switched on. The tokens go
 * to our server, which checks them with the provider; nothing here trusts them.
 */
export function SocialButtons({
  config,
  locale,
  labels,
  onToken,
  onUnavailable,
  busy,
}: SocialButtonsProps) {
  const googleSlot = useRef<HTMLDivElement>(null);
  const [facebookReady, setFacebookReady] = useState(false);
  // The latest callback, so the provider scripts never hold a stale one.
  const tokenRef = useRef(onToken);
  tokenRef.current = onToken;
  const unavailableRef = useRef(onUnavailable);
  unavailableRef.current = onUnavailable;

  const googleId = config.google?.clientId;
  const facebookId = config.facebook?.appId;

  useEffect(() => {
    if (!googleId) return;
    let cancelled = false;
    loadScript('am-google-gsi', 'https://accounts.google.com/gsi/client')
      .then(() => {
        const slot = googleSlot.current;
        if (cancelled || !slot || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: googleId,
          ux_mode: 'popup',
          callback: (response) => {
            if (response.credential) tokenRef.current('google', response.credential);
          },
        });
        slot.replaceChildren();
        window.google.accounts.id.renderButton(slot, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          logo_alignment: 'center',
          width: Math.min(400, slot.clientWidth || 320),
          locale,
        });
      })
      .catch(() => unavailableRef.current?.('google'));
    return () => {
      cancelled = true;
    };
  }, [googleId, locale]);

  useEffect(() => {
    if (!facebookId) return;
    let cancelled = false;
    window.fbAsyncInit = () => {
      window.FB?.init({
        appId: facebookId,
        version: FACEBOOK_GRAPH_VERSION,
        cookie: false,
        xfbml: false,
      });
      if (!cancelled) setFacebookReady(true);
    };
    loadScript('am-facebook-sdk', `https://connect.facebook.net/${facebookLocale(locale)}/sdk.js`)
      .then(() => {
        // Already loaded by an earlier visit to this screen: fbAsyncInit will not run again.
        if (window.FB && !cancelled) window.fbAsyncInit?.();
      })
      .catch(() => unavailableRef.current?.('facebook'));
    return () => {
      cancelled = true;
    };
  }, [facebookId, locale]);

  if (!googleId && !facebookId) return null;

  return (
    <div className="flex flex-col items-stretch gap-3">
      {googleId && (
        <div
          ref={googleSlot}
          className="flex min-h-[44px] justify-center"
          aria-label={labels.continueWithGoogle}
        />
      )}
      {facebookId && (
        <Button
          fullWidth
          iconStart="brand-facebook"
          disabled={!facebookReady}
          loading={busy}
          onClick={() =>
            window.FB?.login(
              (response) => {
                const token = response.authResponse?.accessToken;
                if (token) tokenRef.current('facebook', token);
              },
              { scope: 'public_profile,email' },
            )
          }
        >
          {labels.continueWithFacebook}
        </Button>
      )}
    </div>
  );
}
