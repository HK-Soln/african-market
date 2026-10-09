import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { AuthenticatedUser, PlatformRole, ShopRole } from './claims';

export const IS_PUBLIC = 'am:isPublic';
export const ROLES = 'am:roles';
export const SHOP_ROLES = 'am:shopRoles';

/** Route needs no authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Route needs one of these platform roles. */
export const Roles = (...roles: PlatformRole[]) => SetMetadata(ROLES, roles);

/**
 * Route acts on the shop in `:shopId` (route param) and needs one of these shop roles.
 * Admins always pass. Staff branch scoping is checked in the service with `canAccessBranch`.
 */
export const ShopRoles = (...roles: ShopRole[]) => SetMetadata(SHOP_ROLES, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    return ctx.switchToHttp().getRequest().user;
  },
);
