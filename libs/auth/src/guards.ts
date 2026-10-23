import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  AccessTokenClaims,
  AuthenticatedUser,
  ClientApp,
  PlatformRole,
  sessionCookies,
  ShopRole,
} from './claims';
import { IS_PUBLIC, ROLES, SHOP_ROLES } from './decorators';

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  cookies?: Record<string, string>;
  params?: Record<string, string>;
  /** The browser app the request comes from (the gateway sets it from Origin); unset otherwise. */
  clientApp?: ClientApp;
  user?: AuthenticatedUser;
}

/**
 * The Bearer header, or else the access cookie of the app that is calling. A request from no
 * known app (no Origin: curl, server-side calls) has no cookie session, only the header.
 */
function extractToken(req: RequestLike): string | undefined {
  const header = req.headers['authorization'];
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7);
  return req.clientApp ? req.cookies?.[sessionCookies(req.clientApp).access] : undefined;
}

/** Verifies the access token (Bearer header or cookie) and sets `req.user`. Apply globally in the gateway. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest<RequestLike>();
    const token = extractToken(req);
    if (!token) {
      if (isPublic) return true;
      throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    }
    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
      req.user = { ...claims, id: claims.sub };
      return true;
    } catch {
      if (isPublic) return true;
      throw new UnauthorizedException({ code: 'AUTH_INVALID_TOKEN' });
    }
  }
}

/** Enforces @Roles() and @ShopRoles(). Register after JwtAuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const targets = [ctx.getHandler(), ctx.getClass()];
    const roles = this.reflector.getAllAndOverride<PlatformRole[] | undefined>(ROLES, targets);
    const shopRoles = this.reflector.getAllAndOverride<ShopRole[] | undefined>(SHOP_ROLES, targets);
    if (!roles?.length && !shopRoles?.length) return true;

    const req = ctx.switchToHttp().getRequest<RequestLike>();
    const user = req.user;
    if (!user) throw new UnauthorizedException({ code: 'AUTH_REQUIRED' });
    if (user.roles.includes('admin')) return true;

    if (roles?.length && !roles.some((r) => user.roles.includes(r))) {
      throw new ForbiddenException({ code: 'AUTH_ROLE_REQUIRED' });
    }
    if (shopRoles?.length) {
      const shopId = req.params?.shopId;
      const membership = user.shops.find((s) => s.shopId === shopId);
      if (!shopId || !membership || !shopRoles.includes(membership.role)) {
        throw new ForbiddenException({ code: 'AUTH_SHOP_ACCESS_DENIED' });
      }
    }
    return true;
  }
}

/** Staff may only touch their assigned branches; owners and managers (empty branchIds) see all. */
export function canAccessBranch(
  user: AuthenticatedUser,
  shopId: string,
  branchId: string,
): boolean {
  if (user.roles.includes('admin')) return true;
  const m = user.shops.find((s) => s.shopId === shopId);
  if (!m) return false;
  return m.role !== 'staff' || m.branchIds.length === 0 || m.branchIds.includes(branchId);
}
