import { EntityManager, In } from 'typeorm';
import { EventPayloads } from '@am/contracts';
import { OutboxService } from '@am/database';
import { BranchListing, KnownBranch, KnownShop } from '../entities';

/**
 * Keeps what the catalogue knows about shops and branches in step with the shops service. Each
 * handler runs inside IdempotentConsumer's transaction, and is safe when events come late or out
 * of order: a verification decision or a branch change older than the one applied is ignored.
 */
export class ShopEvents {
  constructor(private readonly outbox: OutboxService) {}

  /** The owner, for certain (a member's token may have recorded the shop first). */
  async shopCreated(manager: EntityManager, event: EventPayloads['shop.created']): Promise<void> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(KnownShop)
      .values({ id: event.shopId, ownerId: event.ownerId })
      .orUpdate(['owner_id'], ['id'])
      .execute();
  }

  async shopVerified(
    manager: EntityManager,
    event: EventPayloads['shop.verified'],
    occurredAt: Date,
  ): Promise<void> {
    const table = manager.getRepository(KnownShop).metadata.tablePath;
    await manager.query(
      `INSERT INTO ${table} (id, verified, verification_changed_at) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE
         SET verified = EXCLUDED.verified,
             verification_changed_at = EXCLUDED.verification_changed_at,
             updated_at = now()
         WHERE known_shop.verification_changed_at IS NULL
            OR known_shop.verification_changed_at < EXCLUDED.verification_changed_at`,
      [event.shopId, event.verificationStatus === 'verified', occurredAt],
    );
  }

  /**
   * A branch that is removed takes its listings with it; the products that were there are
   * announced again so search drops the branch from them.
   */
  async branchUpdated(
    manager: EntityManager,
    event: EventPayloads['branch.updated'],
    occurredAt: Date,
    correlationId?: string,
  ): Promise<void> {
    const table = manager.getRepository(KnownBranch).metadata.tablePath;
    const applied: Array<{ id: string }> = await manager.query(
      `INSERT INTO ${table} (id, shop_id, deleted, changed_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
         SET deleted = EXCLUDED.deleted, changed_at = EXCLUDED.changed_at, updated_at = now()
         WHERE known_branch.changed_at < EXCLUDED.changed_at
           AND known_branch.shop_id = EXCLUDED.shop_id
           AND NOT known_branch.deleted
       RETURNING id`,
      [event.branchId, event.shopId, event.deleted, occurredAt],
    );
    if (!applied.length || !event.deleted) return;

    const listings = await manager.findBy(BranchListing, { branchId: event.branchId });
    if (!listings.length) return;
    await manager.delete(BranchListing, { id: In(listings.map((l) => l.id)) });
    for (const productId of new Set(listings.map((l) => l.productId))) {
      await this.outbox.enqueue(
        manager,
        'product.upserted',
        { productId, shopId: event.shopId },
        correlationId,
      );
    }
  }
}
