import type { CookieOptions, Response } from 'express';
import { type ClientApp, sessionCookies } from '@am/auth';
import type { SessionTokens } from '@am/contracts';
import type { GatewayEnv } from '../env';

/** The refresh cookie is only ever sent to the auth routes, never with ordinary API calls. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * httpOnly keeps both tokens away from page scripts. SameSite=Lax means another site cannot make
 * the browser send them on a POST, which is what protects the state-changing routes; the admin
 * app's are Strict, so they never travel with a request another site starts.
 */
function baseOptions(app: ClientApp, env: GatewayEnv): CookieOptions {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: app === 'admin' ? 'strict' : 'lax',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

/**
 * Sets the session cookies of the app that is calling (decision T-46). A caller that is not one
 * of the browser apps gets none: it has the access token in the response body.
 */
export function setAuthCookies(
  res: Response,
  app: ClientApp | undefined,
  session: SessionTokens,
  env: GatewayEnv,
): void {
  if (!app) return;
  const base = baseOptions(app, env);
  const names = sessionCookies(app);
  res.cookie(names.access, session.accessToken, {
    ...base,
    path: '/',
    expires: new Date(session.accessTokenExpiresAt),
  });
  res.cookie(names.refresh, session.refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    expires: new Date(session.refreshTokenExpiresAt),
  });
}

/** Signs the calling app out of this browser; the other apps keep their sessions. */
export function clearAuthCookies(res: Response, app: ClientApp | undefined, env: GatewayEnv): void {
  if (!app) return;
  const base = baseOptions(app, env);
  const names = sessionCookies(app);
  res.clearCookie(names.access, { ...base, path: '/' });
  res.clearCookie(names.refresh, { ...base, path: REFRESH_COOKIE_PATH });
}
