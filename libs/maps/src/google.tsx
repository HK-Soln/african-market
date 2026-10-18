/// <reference types="google.maps" />
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  AdvancedMarker,
  APIProvider,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { cx, Icon } from '@am/ui';
import { useMapsLanguage } from './context';
import type {
  GoogleMapsConfig,
  LatLng,
  MapCircle,
  MapProvider,
  MapViewProps,
  PlaceSearchProps,
} from './types';

const ConfigContext = createContext<GoogleMapsConfig | null>(null);
const useConfig = () => {
  const config = useContext(ConfigContext);
  if (!config) throw new Error('Google maps used outside createGoogleMaps');
  return config;
};

/**
 * Loads Google's script (once for the page, however many of these there are). Google draws its
 * own labels in this language; region AE gives UAE borders and names.
 */
function Google({ children }: { children: ReactNode }) {
  const { apiKey } = useConfig();
  const language = useMapsLanguage();
  return (
    <APIProvider apiKey={apiKey} language={language} region="AE">
      {children}
    </APIProvider>
  );
}

/** Moves the map when the caller's centre or zoom changes (the map keeps its own otherwise). */
function Follow({ center, zoom }: { center: LatLng; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map?.panTo(center);
  }, [map, center.lat, center.lng]);
  useEffect(() => {
    map?.setZoom(zoom);
  }, [map, zoom]);
  return null;
}

function MapView(props: MapViewProps) {
  return (
    <Google>
      <GoogleMapView {...props} />
    </Google>
  );
}

function GoogleMapView({
  center,
  zoom,
  markers = [],
  selectedId,
  you,
  label,
  clusterLabel,
  onMarkerClick,
  onMarkerDragEnd,
  onMapClick,
  circles = [],
  editableArea,
  onViewChange,
  className,
}: MapViewProps) {
  const { mapId } = useConfig();
  // The latest handler, so the map's listener never calls a stale one.
  const viewChange = useRef(onViewChange);
  viewChange.current = onViewChange;

  return (
    <section aria-label={label} className={cx('am-map', className)}>
      <GoogleMap
        mapId={mapId}
        defaultCenter={center}
        defaultZoom={zoom}
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
        colorScheme="FOLLOW_SYSTEM"
        reuseMaps
        onClick={(event) => {
          const at = event.detail.latLng;
          if (at) onMapClick?.(at);
        }}
        onIdle={(event) => {
          const bounds = event.map.getBounds()?.toJSON();
          const mapCenter = event.map.getCenter();
          if (!bounds || !mapCenter) return;
          viewChange.current?.({
            bounds: {
              minLat: bounds.south,
              minLng: bounds.west,
              maxLat: bounds.north,
              maxLng: bounds.east,
            },
            zoom: event.map.getZoom() ?? zoom,
            center: { lat: mapCenter.lat(), lng: mapCenter.lng() },
          });
        }}
      >
        <Follow center={center} zoom={zoom} />
        {circles.map((circle) => (
          <Circle key={circle.id} {...circle} />
        ))}
        {editableArea && <EditableArea {...editableArea} />}
        {you && (
          <AdvancedMarker position={you} zIndex={1} anchorLeft="-50%" anchorTop="-50%">
            <span className="am-map-you" aria-hidden />
          </AdvancedMarker>
        )}
        {markers.map((marker) =>
          marker.kind === 'cluster' ? (
            <AdvancedMarker
              key={marker.id}
              position={marker.position}
              title={clusterLabel(marker.count)}
              onClick={() => onMarkerClick?.(marker)}
              anchorLeft="-50%"
              anchorTop="-50%"
              zIndex={2}
            >
              <span className="am-map-cluster">{marker.count}</span>
            </AdvancedMarker>
          ) : (
            <AdvancedMarker
              key={marker.id}
              position={marker.position}
              title={marker.label}
              onClick={() => onMarkerClick?.(marker)}
              draggable={marker.draggable}
              onDragEnd={(event) => {
                const at = event.latLng;
                if (at) onMarkerDragEnd?.(marker, { lat: at.lat(), lng: at.lng() });
              }}
              zIndex={marker.id === selectedId ? 4 : 3}
            >
              <span
                className={cx(
                  'am-map-pin',
                  marker.id === selectedId && 'am-map-pin-on',
                  marker.openNow === false && 'am-map-pin-closed',
                )}
              >
                <Icon name="building-store" size={16} />
              </span>
            </AdvancedMarker>
          ),
        )}
      </GoogleMap>
    </section>
  );
}

interface Suggestion {
  id: string;
  text: string;
  secondary: string;
  prediction: google.maps.places.PlacePrediction;
}

/**
 * An area, street or building in the UAE (Places autocomplete, restricted to AE). One session
 * token per search, ended by the pick, as Google bills it.
 */
function PlaceSearch(props: PlaceSearchProps) {
  return (
    <Google>
      <GooglePlaceSearch {...props} />
    </Google>
  );
}

function GooglePlaceSearch({
  label,
  placeholder,
  noResults,
  unavailable,
  onPick,
  near,
}: PlaceSearchProps) {
  const places = useMapsLibrary('places');
  const locale = useMapsLanguage();
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searched, setSearched] = useState(false);
  // Google refused or could not be reached (key limits, API off, offline).
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const session = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    const input = query.trim();
    if (!places || input.length < 2) {
      setSuggestions([]);
      setSearched(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    // Wait for a pause in typing: each request is billed.
    const timer = setTimeout(async () => {
      session.current ??= new places.AutocompleteSessionToken();
      try {
        const { suggestions: found } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            includedRegionCodes: ['ae'],
            language: locale,
            region: 'ae',
            sessionToken: session.current,
            ...(near && { origin: near, locationBias: { center: near, radius: 30_000 } }),
          });
        if (cancelled) return;
        setFailed(false);
        setSuggestions(
          found.flatMap((s) =>
            s.placePrediction
              ? [
                  {
                    id: s.placePrediction.placeId,
                    text: s.placePrediction.mainText?.text ?? s.placePrediction.text.text,
                    secondary: s.placePrediction.secondaryText?.text ?? '',
                    prediction: s.placePrediction,
                  },
                ]
              : [],
          ),
        );
      } catch {
        if (!cancelled) {
          setSuggestions([]);
          setFailed(true);
        }
      }
      if (!cancelled) {
        setSearched(true);
        setActive(-1);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [places, query, locale, near?.lat, near?.lng]);

  const pick = async (suggestion: Suggestion) => {
    const place = suggestion.prediction.toPlace();
    try {
      await place.fetchFields({ fields: ['location', 'displayName'] });
    } catch {
      setFailed(true);
      return;
    } finally {
      session.current = null;
    }
    if (!place.location) return;
    setQuery('');
    setSuggestions([]);
    onPick({
      lat: place.location.lat(),
      lng: place.location.lng(),
      label: place.displayName ?? suggestion.text,
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      void pick(suggestions[active]);
    } else if (event.key === 'Escape') {
      setSuggestions([]);
    }
  };

  const open = suggestions.length > 0;
  return (
    <div className="am-field relative">
      <label htmlFor={inputId} className="am-field-label">
        {label}
      </label>
      <div className="am-input am-input-hasicon min-w-0">
        <Icon name="search" className="am-input-icon" />
        <input
          id={inputId}
          type="search"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          placeholder={placeholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      <ul id={listId} role="listbox" aria-label={label} hidden={!open} className="am-place-list">
        {suggestions.map((s, i) => (
          <li
            key={s.id}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={cx('am-place-option', i === active && 'am-place-option-on')}
            // mousedown, so the pick happens before the input loses focus.
            onMouseDown={(event) => {
              event.preventDefault();
              void pick(s);
            }}
          >
            <Icon name="map-pin" size={18} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-semibold">{s.text}</span>
              {s.secondary && (
                <span className="truncate text-sm text-ink-muted">{s.secondary}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {searched && !open && query.trim().length >= 2 && (
        <p role="status" className="text-sm text-ink-muted">
          {failed ? unavailable : noResults}
        </p>
      )}
    </div>
  );
}

/** A circle in the clay colour, under the markers (a delivery radius). */
function Circle({ center, radiusM }: MapCircle) {
  const map = useMap();
  const circle = useRef<google.maps.Circle | null>(null);
  useEffect(() => {
    if (!map) return;
    circle.current = new google.maps.Circle({
      map,
      clickable: false,
      strokeColor: '#a9500e',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: '#a9500e',
      fillOpacity: 0.12,
    });
    return () => {
      circle.current?.setMap(null);
      circle.current = null;
    };
  }, [map]);
  useEffect(() => {
    circle.current?.setCenter(center);
    circle.current?.setRadius(radiusM);
  }, [map, center.lat, center.lng, radiusM]);
  return null;
}

/**
 * A polygon with draggable corners. Google adds a corner when a midpoint is dragged; every change
 * to the path is reported. A new `path` from the caller (e.g. "start again") replaces it.
 */
function EditableArea({ path, onChange }: { path: LatLng[]; onChange: (path: LatLng[]) => void }) {
  const map = useMap();
  const polygon = useRef<google.maps.Polygon | null>(null);
  const report = useRef(onChange);
  report.current = onChange;
  /** The last path we reported, so our own change does not reset the shape. */
  const last = useRef<string>('');

  useEffect(() => {
    if (!map) return;
    const shape = new google.maps.Polygon({
      map,
      editable: true,
      strokeColor: '#a9500e',
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: '#a9500e',
      fillOpacity: 0.12,
    });
    polygon.current = shape;
    return () => {
      shape.setMap(null);
      polygon.current = null;
    };
  }, [map]);

  useEffect(() => {
    const shape = polygon.current;
    if (!shape) return;
    const key = JSON.stringify(path);
    if (key === last.current) return;
    last.current = key;
    shape.setPath(path);
    const ring = shape.getPath();
    const emit = () => {
      const next = ring.getArray().map((p) => ({ lat: p.lat(), lng: p.lng() }));
      last.current = JSON.stringify(next);
      report.current(next);
    };
    const listeners = ['set_at', 'insert_at', 'remove_at'].map((event) =>
      google.maps.event.addListener(ring, event, emit),
    );
    return () => listeners.forEach((l) => l.remove());
  }, [map, path]);

  return null;
}

/**
 * Google Maps as the app's map provider. Call once per app (the components close over the
 * config); the apps load this entry point only when they have a key.
 */
export function createGoogleMaps(config: GoogleMapsConfig): MapProvider {
  const withConfig =
    <P extends object>(Component: (props: P) => ReactNode) =>
    (props: P) => (
      <ConfigContext.Provider value={config}>
        <Component {...props} />
      </ConfigContext.Provider>
    );
  return {
    name: 'google',
    MapView: withConfig(MapView),
    PlaceSearch: withConfig(PlaceSearch),
  };
}
