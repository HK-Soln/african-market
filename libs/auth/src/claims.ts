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
}

export interface AuthenticatedUser extends AccessTokenClaims {
  id: string;
}

export const ACCESS_TOKEN_COOKIE = 'am_at';
export const REFRESH_TOKEN_COOKIE = 'am_rt';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
