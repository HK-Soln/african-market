'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { MapProvider } from './types';

/** No provider (no key, or its code not loaded yet): the apps show lists and choices only. */
export const noMaps: MapProvider = { name: 'none', MapView: null, PlaceSearch: null };

interface MapsState {
  provider: MapProvider;
  /** The page's language: the map's labels and place suggestions follow it. */
  language: string;
}

const MapsContext = createContext<MapsState>({ provider: noMaps, language: 'en' });

/**
 * Hands the loaded provider to the screens. Each app decides when to load one (see its
 * `lib/maps`): `import('@am/maps/google')` only when it has a key, so pages without a map never
 * fetch Google's code.
 */
export function MapsContextProvider({
  provider,
  language,
  children,
}: MapsState & { children: ReactNode }) {
  return <MapsContext.Provider value={{ provider, language }}>{children}</MapsContext.Provider>;
}

export const useMaps = (): MapProvider => useContext(MapsContext).provider;

export const useMapsLanguage = (): string => useContext(MapsContext).language;
