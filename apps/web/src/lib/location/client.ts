'use client';

import {
  encodeLocation,
  LOCATION_COOKIE,
  LOCATION_MAX_AGE_S,
  roundCoord,
  type ChosenLocation,
} from './location';

/** Remembers the visitor's choice for the server (an IP guess is never saved). */
export function saveLocation(location: ChosenLocation): void {
  if (location.source === 'ip') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LOCATION_COOKIE}=${encodeLocation(location)}; Path=/; Max-Age=${LOCATION_MAX_AGE_S}; SameSite=Lax${secure}`;
}

export function forgetLocation(): void {
  document.cookie = `${LOCATION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export type DeviceLocationError = 'denied' | 'unavailable' | 'timeout' | 'unsupported';

/**
 * Asks the device where it is. Call it only from something the person did (a tap on "Use my
 * location"): browsers and people both distrust a permission prompt on page load.
 */
export function deviceLocation(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject: (reason: DeviceLocationError) => void) => {
    if (!('geolocation' in navigator)) return reject('unsupported');
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: roundCoord(position.coords.latitude),
          lng: roundCoord(position.coords.longitude),
        }),
      (error) =>
        reject(
          error.code === error.PERMISSION_DENIED
            ? 'denied'
            : error.code === error.TIMEOUT
              ? 'timeout'
              : 'unavailable',
        ),
      // City-block accuracy is enough to rank shops, and comes back much faster than GPS-grade.
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  });
}
