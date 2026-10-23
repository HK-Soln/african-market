/**
 * Every environment value this app reads, in one place; nothing else reads process.env. Every
 * key must be set, with no default (decision T-45); a feature that can be off is set to `none`,
 * so leaving a key out is never mistaken for switching it off.
 *
 * NEXT_PUBLIC_* values are compiled into the browser code at build time, and Next only replaces
 * them when they are written out in full (`process.env.NEXT_PUBLIC_X`), so they cannot be looked
 * up by name or validated by a schema here. A missing one fails `next build` (and `next dev`).
 * GATEWAY_URL is read when the server runs, and checked when it starts (instrumentation.ts).
 */

/** A key that must be set and not empty. */
function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} must be set (see .env.example)`);
  return value;
}

/** A key that must be set; `none` switches its feature off. */
function noneMeansOff(value: string | undefined, name: string): string | undefined {
  if (!value)
    throw new Error(`${name} must be set, to \`none\` to switch it off (see .env.example)`);
  return value === 'none' ? undefined : value;
}

/** With a feature on, a setting it cannot work without. */
function requiredWith(feature: string, value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} must be set when ${feature} is (see .env.example)`);
  return value;
}

const gatewayUrl = required(process.env.NEXT_PUBLIC_GATEWAY_URL, 'NEXT_PUBLIC_GATEWAY_URL');
const sentryDsn = noneMeansOff(process.env.NEXT_PUBLIC_SENTRY_DSN, 'NEXT_PUBLIC_SENTRY_DSN');
const sentryEnvironment = noneMeansOff(
  process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  'NEXT_PUBLIC_SENTRY_ENVIRONMENT',
);
const googleMapsKey = noneMeansOff(
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY,
  'NEXT_PUBLIC_GOOGLE_MAPS_KEY',
);
const googleMapId = noneMeansOff(
  process.env.NEXT_PUBLIC_GOOGLE_MAP_ID,
  'NEXT_PUBLIC_GOOGLE_MAP_ID',
);

export const config = {
  /** The gateway as the browser reaches it. */
  gatewayUrl,
  /**
   * The gateway as this app's server reaches it: inside the VPC in AWS, so not public; the same
   * as the browser's address locally. Read when called, because it is set where the server
   * runs, not where it is built.
   */
  serverGatewayUrl: (): string => required(process.env.GATEWAY_URL, 'GATEWAY_URL'),
  /** The customer site: where the Terms and Privacy policy live. */
  webUrl: required(process.env.NEXT_PUBLIC_WEB_URL, 'NEXT_PUBLIC_WEB_URL'),
  /**
   * Error reports (Sentry), compiled in like the gateway's address: off with `none` as the DSN. With
   * one, the environment the reports are filed under (staging, production) must be set too.
   */
  sentry: sentryDsn
    ? {
        dsn: sentryDsn,
        environment: requiredWith(
          'NEXT_PUBLIC_SENTRY_DSN',
          sentryEnvironment,
          'NEXT_PUBLIC_SENTRY_ENVIRONMENT',
        ),
      }
    : undefined,
  /**
   * Google Maps (the branch pin and its delivery radius): off with `none` as the key, and the branch
   * step then places the pin from the device's location or the emirate. With a key, the map id
   * (Map Management, for the markers) is needed.
   */
  googleMaps: googleMapsKey
    ? {
        apiKey: googleMapsKey,
        mapId: requiredWith(
          'NEXT_PUBLIC_GOOGLE_MAPS_KEY',
          googleMapId,
          'NEXT_PUBLIC_GOOGLE_MAP_ID',
        ),
      }
    : undefined,
} as const;
