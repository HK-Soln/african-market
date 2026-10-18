'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { MapsContextProvider, noMaps, type MapProvider } from '@am/maps';
import { config } from '../config';

export { useMaps } from '@am/maps';
export type * from '@am/maps';

/**
 * Loads the map provider for this build: Google's code is fetched only when a key is configured,
 * and Google's own script only when a map or the place search is on screen. Until then, and
 * without a key, screens get `noMaps` and show lists and choices only.
 */
export function MapsProvider({ children }: { children: ReactNode }) {
  const language = useLocale();
  const [provider, setProvider] = useState<MapProvider>(noMaps);
  useEffect(() => {
    const google = config.googleMaps;
    if (!google) return;
    let cancelled = false;
    void import('@am/maps/google').then(({ createGoogleMaps }) => {
      if (!cancelled) setProvider(createGoogleMaps(google));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <MapsContextProvider provider={provider} language={language}>
      {children}
    </MapsContextProvider>
  );
}

/** Whether this build has a map at all (known before the provider's code has loaded). */
export const mapsConfigured = Boolean(config.googleMaps);
