import type { ComponentType } from 'react';

export interface LatLng {
  lat: number;
  lng: number;
}

/** What the map shows: a shop's branch, or a group of them at lower zoom (from the search API). */
export type MapMarker =
  | { kind: 'pin'; id: string; position: LatLng; label: string; openNow?: boolean }
  | { kind: 'cluster'; id: string; position: LatLng; count: number };

export interface MapBounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface MapViewProps {
  /** Where the map looks; changing it moves the map there. */
  center: LatLng;
  zoom: number;
  markers?: MapMarker[];
  selectedId?: string;
  /** The visitor's own position, drawn as a dot. */
  you?: LatLng;
  /** Accessible name of the map region. */
  label: string;
  /** Names a cluster's button, e.g. "12 shops: zoom in". */
  clusterLabel: (count: number) => string;
  onMarkerClick?: (marker: MapMarker) => void;
  /** After each pan or zoom has settled, with what is in view (for the map search). */
  onViewChange?: (view: { bounds: MapBounds; zoom: number; center: LatLng }) => void;
  className?: string;
}

/** A place someone picked from the search box. */
export interface PickedPlace extends LatLng {
  label: string;
}

export interface PlaceSearchProps {
  label: string;
  placeholder: string;
  /** Said when nothing matches. */
  noResults: string;
  /** Said when the provider cannot search right now; the other choices still work. */
  unavailable: string;
  onPick: (place: PickedPlace) => void;
  /** Suggestions near here come first. */
  near?: LatLng;
}

/**
 * The map provider behind the app (CLAUDE.md: providers behind an adapter). Google Maps now; a
 * MapLibre one can replace it. Without a provider the app shows lists and an emirate choice only,
 * so every caller must cope with `MapView` and `PlaceSearch` being null.
 */
export interface MapProvider {
  name: 'google' | 'none';
  MapView: ComponentType<MapViewProps> | null;
  PlaceSearch: ComponentType<PlaceSearchProps> | null;
}
