import { cookies, headers } from 'next/headers';
import { decodeLocation, ipLocation, LOCATION_COOKIE, type ChosenLocation } from './location';

/**
 * Where to search from on this request: the visitor's own choice (cookie), else the city of their
 * connection, else nothing (the page asks). Reading these makes the page render per request.
 */
export async function serverLocation(): Promise<ChosenLocation | null> {
  const saved = decodeLocation((await cookies()).get(LOCATION_COOKIE)?.value);
  if (saved) return saved;
  return ipLocation(await headers());
}
