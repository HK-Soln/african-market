import type { CookieOptions, Response } from 'express';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '@am/auth';
import type { SessionTokens } from '@am/contracts';
import type { GatewayEnv } from '../env';

/** The refresh cookie is only ever sent to the auth routes, never with ordinary API calls. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * httpOnly keeps both tokens away from page scripts. SameSite=Lax means another site cannot make
 * the browser send them on a POST, which is what protects the state-changing routes.
 */
function baseOptions(env: GatewayEnv): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'staging' || env.NODE_ENV === 'production',
    sameSite: 'lax',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setAuthCookies(res: Response, session: SessionTokens, env: GatewayEnv): void {
  const base = baseOptions(env);
  res.cookie(ACCESS_TOKEN_COOKIE, session.accessToken, {
    ...base,
    path: '/',
    expires: new Date(session.accessTokenExpiresAt),
  });
  res.cookie(REFRESH_TOKEN_COOKIE, session.refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    expires: new Date(session.refreshTokenExpiresAt),
  });
}

export function clearAuthCookies(res: Response, env: GatewayEnv): void {
  const base = baseOptions(env);
  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
}
