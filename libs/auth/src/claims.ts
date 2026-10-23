/** Platform-level roles. Shop-level roles live in `shops[]` (one account can be customer and seller). */
export type PlatformRole = 'customer' | 'seller' | 'admin';
export type ShopRole = 'owner' | 'manager' | 'staff';

export interface ShopMembershipClaim {
  shopId: string;
  role: ShopRole;
  /** Empty means all branches (owner, manager). */
  branchIds: string[];
}

/** Access-token claims. Access tokens live 15 minutes; refresh tokens rotate and sit in an httpOnly cookie. */
export interface AccessTokenClaims {
  sub: string;
  roles: PlatformRole[];
  shops: ShopMembershipClaim[];
  locale?: string;
  /**
   * When the person signed in (Unix seconds), kept across refreshes. Actions that cannot be
   * undone, such as deleting the account, ask for a recent one.
   */
  auth_time?: number;
}

export interface AuthenticatedUser extends AccessTokenClaims {
  id: string;
}

/**
 * The three browser apps. Each keeps its own session (decision T-46): signing in to one never
 * replaces the session of another in the same browser. The gateway knows which app is calling
 * from the browser's Origin header, which page scripts cannot change.
 */
export const CLIENT_APPS = ['web', 'seller', 'admin'] as const;
export type ClientApp = (typeof CLIENT_APPS)[number];

/** The access and refresh cookie of one app, e.g. `am_seller_at` and `am_seller_rt`. */
export const sessionCookies = (app: ClientApp) => ({
  access: `am_${app}_at`,
  refresh: `am_${app}_rt`,
});

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
