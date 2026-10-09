/**
 * Registry of every backend service. The gateway uses it to build TCP clients;
 * each service uses it to know its own ports and schema.
 *
 * Ports are local-development defaults; every one can be overridden by env
 * (`<NAME>_TCP_PORT`, `<NAME>_HTTP_PORT`, `<NAME>_HOST`).
 */
export const SERVICES = {
  identity: { tcpPort: 4101, httpPort: 4201, schema: 'identity', phase: 0 },
  shops: { tcpPort: 4102, httpPort: 4202, schema: 'shops', phase: 1 },
  catalog: { tcpPort: 4103, httpPort: 4203, schema: 'catalog', phase: 1 },
  discovery: { tcpPort: 4104, httpPort: 4204, schema: 'discovery', phase: 1 },
  media: { tcpPort: 4105, httpPort: 4205, schema: 'media', phase: 1 },
  messaging: { tcpPort: 4106, httpPort: 4206, schema: 'messaging', phase: 2 },
  notifications: { tcpPort: 4107, httpPort: 4207, schema: 'notifications', phase: 2 },
  orders: { tcpPort: 4108, httpPort: 4208, schema: 'orders', phase: 3 },
  payments: { tcpPort: 4109, httpPort: 4209, schema: 'payments', phase: 3 },
} as const;

export type ServiceName = keyof typeof SERVICES;

export const SERVICE_NAMES = Object.keys(SERVICES) as ServiceName[];

/** Injection token for the gateway's TCP client to a service, e.g. `serviceClientToken('identity')`. */
export const serviceClientToken = (name: ServiceName): string =>
  `SERVICE_CLIENT_${name.toUpperCase()}`;
