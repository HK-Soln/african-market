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
} as const;
