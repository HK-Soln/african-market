'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { auth } from '@/lib/browser-api';

/** What the screens need to know about who is signed in. */
export interface SessionUser {
  id: string;
  name: string | null;
  preferredLanguage: string;
  homeEmirate: string | null;
  marketingConsent: boolean;
  /** The admin app lets in only accounts with `admin`. */
  roles?: string[];
}

interface Session {
  /** `loading` only until the first answer from the gateway. */
  status: 'loading' | 'signed-in' | 'signed-out';
  user: SessionUser | null;
  /** Called by the sign-in screens, and after the profile changes. */
  setUser: (user: SessionUser) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

/**
 * Remembers only that this browser has signed in before, so visitors who never have are not
 * asked "who am I?" on every page. The session itself lives in httpOnly cookies that scripts
 * cannot read.
 */
const HINT_KEY = 'am.signed-in';
const hint = {
  get: () => {
    try {
      return window.localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return false;
    }
  },
  set: (on: boolean) => {
    try {
      if (on) window.localStorage.setItem(HINT_KEY, '1');
      else window.localStorage.removeItem(HINT_KEY);
    } catch {
      // Private browsing or blocked storage: the session still works, with one extra request.
    }
  },
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Session['status']>('loading');
  const [user, setUserState] = useState<SessionUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!hint.get()) {
      setStatus('signed-out');
      return;
    }
    void auth.me().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setUserState(result.data.user);
        setStatus('signed-in');
        return;
      }
      // Offline is not signed out: keep the hint so the next visit asks again.
      if (result.code !== 'NETWORK_ERROR') hint.set(false);
      setStatus('signed-out');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setUser = useCallback((next: SessionUser) => {
    hint.set(true);
    setUserState(next);
    setStatus('signed-in');
  }, []);

  const signOut = useCallback(async () => {
    await auth.logout();
    hint.set(false);
    setUserState(null);
    setStatus('signed-out');
  }, []);

  const value = useMemo(
    () => ({ status, user, setUser, signOut }),
    [status, user, setUser, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside <SessionProvider>');
  return session;
}
