'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { config } from '../config';
import type { MapProvider } from './types';

export type * from './types';

/** No key: lists and the emirate choice only. */
const noMaps: MapProvider = {
  name: 'none',
  MapView: null,
  PlaceSearch: null,
};

const MapsContext = createContext<MapProvider>(noMaps);

/**
 * Picks the provider for this build. Google's code is fetched only when a key is configured, and
 * Google's own script only when a map or the place search is on screen; until then callers get
 * `noMaps`.
 */
export function MapsProvider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<MapProvider>(noMaps);
  useEffect(() => {
    if (!config.googleMaps) return;
    let cancelled = false;
    void import('./google').then(({ googleMaps }) => {
      if (!cancelled) setProvider(googleMaps);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return <MapsContext.Provider value={provider}>{children}</MapsContext.Provider>;
}

export const useMaps = () => useContext(MapsContext);

/** Whether this build has a map at all (known before the provider's code has loaded). */
export const mapsConfigured = Boolean(config.googleMaps);
