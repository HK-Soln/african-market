import { EntityManager } from 'typeorm';
import { ActorClaims, CatalogErrors } from '@am/contracts';
import { KnownShop } from '../entities';
import { catalogError } from '../errors';

export type ShopAccess = 'owner' | 'manager' | 'staff' | 'admin';

const isAdmin = (actor: ActorClaims) => actor.roles.includes('admin');

/**
 * What the actor is to this shop. The owner comes from `shop.created`; managers and staff from
 * the access token (at most 15 minutes old), as in the shops service.
 */
export function accessTo(
  actor: ActorClaims | undefined,
  shop: Pick<KnownShop, 'id' | 'ownerId'>,
): ShopAccess | undefined {
  if (!actor) return undefined;
  if (shop.ownerId && shop.ownerId === actor.userId) return 'owner';
  const role = actor.shops.find((s) => s.shopId === shop.id)?.role;
  if (role) return role;
  if (isAdmin(actor)) return 'admin';
  return undefined;
}

/** Owners and managers change products; staff only stock at their branches; admins moderate. */
export function requireEditor(actor: ActorClaims, shop: Pick<KnownShop, 'id' | 'ownerId'>): void {
  const access = accessTo(actor, shop);
  // Someone with no role learns nothing, not even that the shop exists.
  if (!access) throw catalogError(CatalogErrors.shopNotFound);
  if (access !== 'owner' && access !== 'manager') throw catalogError(CatalogErrors.forbidden);
}

/** Staff limited to some branches work only there; everyone else with a role works everywhere. */
export function canWorkAt(
  actor: ActorClaims,
  shop: Pick<KnownShop, 'id' | 'ownerId'>,
  branchId: string,
): boolean {
  const access = accessTo(actor, shop);
  if (access === 'owner' || access === 'manager') return true;
  if (access !== 'staff') return false;
  const branchIds = actor.shops.find((s) => s.shopId === shop.id)?.branchIds ?? [];
  return branchIds.length === 0 || branchIds.includes(branchId);
}

export function requireAdmin(actor: ActorClaims): void {
  if (!isAdmin(actor)) throw catalogError(CatalogErrors.adminOnly);
}

/**
 * The shop as the catalogue knows it. A member can arrive before `shop.created` does (the event
 * and their new token race): their token is signed by identity, so the shop is recorded from it,
 * and the event fills in the owner for certain when it lands.
 */
export async function shopFor(
  manager: EntityManager,
  actor: ActorClaims,
  shopId: string,
  options: { lock?: boolean } = {},
): Promise<KnownShop> {
  const find = () =>
    manager.findOne(KnownShop, {
      where: { id: shopId },
      ...(options.lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
  let shop = await find();
  if (!shop) {
    const role = actor.shops.find((s) => s.shopId === shopId)?.role;
    if (!role) throw catalogError(CatalogErrors.shopNotFound);
    await manager
      .createQueryBuilder()
      .insert()
      .into(KnownShop)
      .values({ id: shopId, ownerId: role === 'owner' ? actor.userId : null })
      .orIgnore()
      .execute();
    shop = await find();
  }
  return shop!;
}
