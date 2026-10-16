import { ActorClaims, ShopErrors } from '@am/contracts';
import type { Shop } from '../entities';
import { shopError } from '../errors';

export type ShopAccess = 'owner' | 'manager' | 'staff' | 'admin';

/**
 * What the actor is to this shop. The owner is known for certain from the shop itself, so a
 * shop's creator can work on it before their access token carries the new membership; managers
 * and staff come from the token (at most 15 minutes old).
 */
export function accessTo(
  actor: ActorClaims,
  shop: Pick<Shop, 'id' | 'ownerId'>,
): ShopAccess | undefined {
  if (shop.ownerId === actor.userId) return 'owner';
  const role = actor.shops.find((s) => s.shopId === shop.id)?.role;
  if (role) return role;
  if (actor.roles.includes('admin')) return 'admin';
  return undefined;
}

/** Owners and managers change a shop and its branches; staff and admins may only look. */
export function requireEditor(actor: ActorClaims, shop: Pick<Shop, 'id' | 'ownerId'>): void {
  const access = accessTo(actor, shop);
  // Someone with no role learns nothing, not even that the shop exists.
  if (!access) throw shopError(ShopErrors.notFound);
  if (access !== 'owner' && access !== 'manager') throw shopError(ShopErrors.forbidden);
}

/** Anyone with a role in the shop, or an admin, may read it in full (drafts included). */
export function requireReader(actor: ActorClaims, shop: Pick<Shop, 'id' | 'ownerId'>): void {
  // A shop the actor has nothing to do with answers as if it did not exist.
  if (!accessTo(actor, shop)) throw shopError(ShopErrors.notFound);
}
