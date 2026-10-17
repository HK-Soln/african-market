import { EMIRATES, type EmirateCode } from '@am/geo';

/**
 * Where the visitor searches from, and how we know it. Kept in a first-party cookie so the
 * server can render results for it; never stored on our side.
 */
export interface ChosenLocation {
  lat: number;
  lng: number;
  /**
   * gps: the device, after the person asked; place: an area or building they searched for;
   * emirate: an emirate they picked; ip: guessed from the connection (never saved).
   */
  source: 'gps' | 'place' | 'emirate' | 'ip';
  emirate?: EmirateCode;
  /** The place's name as the person picked it. */
  label?: string;
}

export const LOCATION_COOKIE = 'am_loc';
/** A month: long enough to come back to, short enough to ask again after a move. */
export const LOCATION_MAX_AGE_S = 30 * 24 * 60 * 60;
const LABEL_MAX = 120;
const SOURCES: readonly ChosenLocation['source'][] = ['gps', 'place', 'emirate', 'ip'];

/**
 * Three decimals is about 110 m: enough to rank shops by distance, and no more precise than that,
 * so the cookie never holds someone's exact door.
 */
export const roundCoord = (value: number) => Math.round(value * 1000) / 1000;

const isLat = (v: unknown): v is number => typeof v === 'number' && v >= -90 && v <= 90;
const isLng = (v: unknown): v is number => typeof v === 'number' && v >= -180 && v <= 180;
const isEmirate = (v: unknown): v is EmirateCode =>
  typeof v === 'string' && EMIRATES.some((e) => e.code === v);

export function emirateCenter(code: EmirateCode): { lat: number; lng: number } {
  const emirate = EMIRATES.find((e) => e.code === code)!;
  return { lat: emirate.center.lat, lng: emirate.center.lng };
}

/** The choice for an emirate picked from the list: its centre. */
export function emirateLocation(code: EmirateCode): ChosenLocation {
  return { ...emirateCenter(code), source: 'emirate', emirate: code };
}

/** The cookie's value: rounded, with only the fields above, as URI-safe JSON. */
export function encodeLocation(location: ChosenLocation): string {
  const value: ChosenLocation = {
    lat: roundCoord(location.lat),
    lng: roundCoord(location.lng),
    source: location.source,
    ...(location.emirate && { emirate: location.emirate }),
    ...(location.label && { label: location.label.slice(0, LABEL_MAX) }),
  };
  return encodeURIComponent(JSON.stringify(value));
}

/** Reads the cookie; anything malformed or edited by hand counts as no choice. */
export function decodeLocation(raw: string | undefined | null): ChosenLocation | null {
  if (!raw) return null;
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { lat, lng, source, emirate, label } = value;
  // An IP guess is made per request and never saved, so a cookie claiming one is not ours.
  if (!isLat(lat) || !isLng(lng) || source === 'ip') return null;
  if (!SOURCES.includes(source as ChosenLocation['source'])) return null;
  return {
    lat: roundCoord(lat),
    lng: roundCoord(lng),
    source: source as ChosenLocation['source'],
    ...(isEmirate(emirate) && { emirate }),
    ...(typeof label === 'string' && label && { label: label.slice(0, LABEL_MAX) }),
  };
}

/** ISO 3166-2 subdivisions of the UAE (AE-DU and so on) to our emirate codes. */
const REGION_TO_EMIRATE: Record<string, EmirateCode> = {
  DU: 'DXB',
  AZ: 'AUH',
  SH: 'SHJ',
  AJ: 'AJM',
  UQ: 'UAQ',
  RK: 'RAK',
  FU: 'FUJ',
};

export function emirateFromRegion(region: string | null | undefined): EmirateCode | undefined {
  if (!region) return undefined;
  return REGION_TO_EMIRATE[region.trim().toUpperCase().replace(/^AE-/, '')];
}

interface HeaderReader {
  get(name: string): string | null;
}

/**
 * The city the connection comes from, from the viewer headers CloudFront adds in front of the
 * site (country, region, the city's coordinates). Only UAE visitors get a guess; a header set by
 * anyone else can only move their own starting point, so nothing here needs to trust it.
 */
export function ipLocation(headers: HeaderReader): ChosenLocation | null {
  if (headers.get('cloudfront-viewer-country')?.toUpperCase() !== 'AE') return null;
  const emirate = emirateFromRegion(headers.get('cloudfront-viewer-country-region'));
  const lat = Number(headers.get('cloudfront-viewer-latitude') ?? NaN);
  const lng = Number(headers.get('cloudfront-viewer-longitude') ?? NaN);
  if (Number.isFinite(lat) && Number.isFinite(lng) && isLat(lat) && isLng(lng)) {
    return {
      lat: roundCoord(lat),
      lng: roundCoord(lng),
      source: 'ip',
      ...(emirate && { emirate }),
    };
  }
  return emirate ? { ...emirateCenter(emirate), source: 'ip', emirate } : null;
}
