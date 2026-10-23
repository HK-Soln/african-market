import type { NextFunction, Request, Response } from 'express';
import { CLIENT_APPS, type ClientApp } from '@am/auth';

declare module 'express-serve-static-core' {
  interface Request {
    /** The browser app this request comes from, by its Origin header; unset for any other caller. */
    clientApp?: ClientApp;
  }
}

/**
 * Sets `req.clientApp` from the Origin header, so the auth routes and the guard use that app's
 * own session cookies (decision T-46). Browsers send Origin on every call an app makes to the
 * gateway (another host, so cross-origin), and page scripts cannot change it: a script on the
 * customer site can never act with the admin session. A request without a known Origin (curl,
 * the apps' server-side calls) has no cookie session; it uses the Bearer header.
 */
export function identifyClientApp(origins: Record<ClientApp, string>) {
  const byOrigin = new Map<string, ClientApp>(CLIENT_APPS.map((app) => [origins[app], app]));
  return (req: Request, _res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    req.clientApp = origin ? byOrigin.get(origin) : undefined;
    next();
  };
}
