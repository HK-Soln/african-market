/**
 * What a search is, as it appears in the results page's address: the text, the filters and
 * list or map. Where it is searched from is not here: that is the location cookie
 * (lib/location), so a shared link searches near whoever opens it.
 */

export type SearchMode = 'pickup' | 'delivery';
export type SearchView = 'list' | 'map';

export interface SearchState {
  q: string;
  categoryId?: string;
  /** ISO 3166-1 alpha-2, upper case. */
  origin?: string;
  openNow: boolean;
  /** Pickup: only branches that would also deliver to the point. */
  deliversToMe: boolean;
  mode: SearchMode;
  /** Pickup: how far the customer will travel. One of RADIUS_STEPS_KM. */
  radiusKm: number;
  view: SearchView;
}

/** The travel radii offered, widening one step at a time (the API allows 0.5 to 50 km). */
export const RADIUS_STEPS_KM = [2, 5, 10, 25, 50] as const;
export const DEFAULT_RADIUS_KM = 10;

export const DEFAULT_SEARCH: SearchState = {
  q: '',
  openNow: false,
  deliversToMe: false,
  mode: 'pickup',
  radiusKm: DEFAULT_RADIUS_KM,
  view: 'list',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function read(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/** Reads the address, ignoring anything malformed (a hand-edited link still shows results). */
export function parseSearch(params: Params): SearchState {
  const q = (read(params, 'q') ?? '').trim().slice(0, 100);
  const category = read(params, 'category');
  const origin = read(params, 'origin');
  const radius = Number(read(params, 'radius'));
  return {
    q,
    categoryId: category && UUID.test(category) ? category.toLowerCase() : undefined,
    origin: origin && /^[A-Za-z]{2}$/.test(origin) ? origin.toUpperCase() : undefined,
    openNow: read(params, 'open') === '1',
    deliversToMe: read(params, 'delivers') === '1',
    mode: read(params, 'mode') === 'delivery' ? 'delivery' : 'pickup',
    radiusKm: (RADIUS_STEPS_KM as readonly number[]).includes(radius) ? radius : DEFAULT_RADIUS_KM,
    view: read(params, 'view') === 'map' ? 'map' : 'list',
  };
}

/** The address's query, leaving out defaults so links stay short. */
export function searchQueryString(state: SearchState): string {
  const out = new URLSearchParams();
  if (state.q) out.set('q', state.q);
  if (state.categoryId) out.set('category', state.categoryId);
  if (state.origin) out.set('origin', state.origin);
  if (state.openNow) out.set('open', '1');
  if (state.mode === 'delivery') out.set('mode', 'delivery');
  if (state.mode === 'pickup' && state.deliversToMe) out.set('delivers', '1');
  if (state.mode === 'pickup' && state.radiusKm !== DEFAULT_RADIUS_KM) {
    out.set('radius', String(state.radiusKm));
  }
  if (state.view === 'map') out.set('view', 'map');
  const text = out.toString();
  return text ? `?${text}` : '';
}

/** Filters that narrow the results (what "clear filters" removes). */
export function hasFilters(state: SearchState): boolean {
  return Boolean(state.categoryId || state.origin || state.openNow || state.deliversToMe);
}

/** The next wider radius, or undefined at the widest. */
export function widerRadius(km: number): number | undefined {
  return RADIUS_STEPS_KM.find((step) => step > km);
}

/** The query for GET /api/v1/search/nearby. */
export function nearbyQuery(state: SearchState, point: { lat: number; lng: number }) {
  return {
    lat: point.lat,
    lng: point.lng,
    mode: state.mode,
    ...(state.q ? { q: state.q } : {}),
    ...(state.categoryId ? { categoryId: state.categoryId } : {}),
    ...(state.origin ? { originCountry: state.origin } : {}),
    ...(state.openNow ? { openNow: true } : {}),
    ...(state.mode === 'pickup'
      ? {
          radiusM: state.radiusKm * 1000,
          ...(state.deliversToMe ? { deliversToMe: true } : {}),
        }
      : {}),
  };
}

/** The filters for GET /api/v1/search/map (the box and zoom come from the map). */
export function mapFilters(state: SearchState) {
  return {
    ...(state.q ? { q: state.q } : {}),
    ...(state.categoryId ? { categoryId: state.categoryId } : {}),
    ...(state.origin ? { originCountry: state.origin } : {}),
    ...(state.openNow ? { openNow: true } : {}),
  };
}

/** "350 m", "1.2 km", "12 km" in the visitor's language. */
export function formatDistance(meters: number, locale: string): string {
  if (meters < 1000) {
    const rounded = Math.max(50, Math.round(meters / 50) * 50);
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'meter' }).format(rounded);
  }
  const km = meters / 1000;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'kilometer',
    maximumFractionDigits: km < 10 ? 1 : 0,
  }).format(km);
}
