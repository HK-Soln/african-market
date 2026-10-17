'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import { useRouter } from '@/i18n/navigation';
import { forgetLocation, saveLocation } from '@/lib/location/client';
import type { ChosenLocation } from '@/lib/location/location';

interface LocationState {
  /** Null until the visitor chooses and no guess could be made. */
  location: ChosenLocation | null;
  /** Saves the choice and renders the page again for it. */
  choose: (location: ChosenLocation) => void;
  forget: () => void;
  /** The page is rendering again for a new choice. */
  updating: boolean;
}

const LocationContext = createContext<LocationState | null>(null);

/** Holds the search location for the page, starting from what the server worked out. */
export function LocationProvider({
  initial,
  children,
}: {
  initial: ChosenLocation | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const [location, setLocation] = useState(initial);
  const [updating, startTransition] = useTransition();

  const choose = useCallback(
    (next: ChosenLocation) => {
      saveLocation(next);
      setLocation(next);
      startTransition(() => router.refresh());
    },
    [router],
  );
  const forget = useCallback(() => {
    forgetLocation();
    setLocation(null);
    startTransition(() => router.refresh());
  }, [router]);

  return (
    <LocationContext.Provider value={{ location, choose, forget, updating }}>
      {children}
    </LocationContext.Provider>
  );
}

export function useSearchLocation(): LocationState {
  const state = useContext(LocationContext);
  if (!state) throw new Error('useSearchLocation needs a LocationProvider');
  return state;
}
