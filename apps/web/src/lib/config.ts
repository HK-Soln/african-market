/**
 * Every environment value this app reads, in one place; nothing else reads process.env.
 *
 * NEXT_PUBLIC_* values are compiled into the browser code at build time, and Next only replaces
 * them when they are written out in full (`process.env.NEXT_PUBLIC_X`), so they cannot be looked
 * up by name or validated by a schema here.
 */
export const config = {
  /** The gateway as the browser reaches it. */
  gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:4000',
  /** The gateway as this app's server reaches it: inside the VPC in AWS, so not public. */
  serverGatewayUrl:
    process.env.GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:4000',
  /** A production build (`next build`), as opposed to `next dev`. */
  isProductionBuild: process.env.NODE_ENV === 'production',
} as const;
