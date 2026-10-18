/**
 * Every environment value this app reads, in one place; nothing else reads process.env.
 *
 * NEXT_PUBLIC_* values are compiled into the browser code at build time, and Next only replaces
 * them when they are written out in full (`process.env.NEXT_PUBLIC_X`), so they cannot be looked
 * up by name or validated by a schema here. A missing one fails `next build` (and `next dev`).
 */
function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} must be set (see .env.example)`);
  return value;
}

const gatewayUrl = required(process.env.NEXT_PUBLIC_GATEWAY_URL, 'NEXT_PUBLIC_GATEWAY_URL');
const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
const googleMapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || undefined;

export const config = {
  /** The gateway as the browser reaches it. */
  gatewayUrl,
  /**
   * The gateway as this app's server reaches it: inside the VPC in AWS, so not public. The same
   * as the browser's address when unset (locally).
   */
  serverGatewayUrl: process.env.GATEWAY_URL ?? gatewayUrl,
  /** The customer site: where the Terms and Privacy policy live. */
  webUrl: required(process.env.NEXT_PUBLIC_WEB_URL, 'NEXT_PUBLIC_WEB_URL'),
  /**
   * Error reports (Sentry), compiled in like the gateway's address: off without a DSN. With one,
   * the environment the reports are filed under (staging, production) must be set too.
   */
  sentry: sentryDsn
    ? {
        dsn: sentryDsn,
        environment: required(
          process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
          'NEXT_PUBLIC_SENTRY_ENVIRONMENT',
        ),
      }
    : undefined,
  /**
   * Google Maps (the branch pin and its delivery radius): off without a key, and the branch step
   * then places the pin from the device's location or the emirate. With a key, the map id
   * (Map Management, for the markers) must be set too.
   */
  googleMaps: googleMapsKey
    ? {
        apiKey: googleMapsKey,
        mapId: required(process.env.NEXT_PUBLIC_GOOGLE_MAP_ID, 'NEXT_PUBLIC_GOOGLE_MAP_ID'),
      }
    : undefined,
} as const;
