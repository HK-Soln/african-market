import { Injectable, OnModuleInit } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { EventPayloads } from '@am/contracts';
import { EventBus } from '@am/core';
import { IdempotentConsumer, OutboxService } from '@am/database';
import { ShopMember, User } from '../entities';

/**
 * When a shop is created, its creator becomes its owner and a seller (F1-02). Their next access
 * token carries it; the shops service already treats them as owner in the meantime.
 */
@Injectable()
export class ShopOwnerConsumer implements OnModuleInit {
  constructor(
    private readonly bus: EventBus,
    private readonly once: IdempotentConsumer,
    private readonly outbox: OutboxService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe('shop.created', async (event) => {
      await this.once.handle(event, 'identity.shop-owner', (manager) =>
        this.grantOwner(manager, event.payload, event.correlationId),
      );
    });
  }

  async grantOwner(
    manager: EntityManager,
    shop: EventPayloads['shop.created'],
    correlationId?: string,
  ): Promise<void> {
    const user = await manager.findOne(User, {
      where: { id: shop.ownerId },
      lock: { mode: 'pessimistic_write' },
    });
    // The account was deleted in the meantime: nobody to make owner.
    if (!user) return;

    const member = await manager.findOneBy(ShopMember, { userId: user.id, shopId: shop.shopId });
    if (!member) {
      await manager.insert(ShopMember, {
        userId: user.id,
        shopId: shop.shopId,
        role: 'owner',
        branchIds: [],
      });
    } else if (member.role !== 'owner') {
      await manager.update(ShopMember, { id: member.id }, { role: 'owner', branchIds: [] });
    }
    if (!user.roles.includes('seller')) {
      await manager.update(User, { id: user.id }, { roles: [...user.roles, 'seller'] });
    }
    await this.outbox.enqueue(
      manager,
      'membership.changed',
      { userId: user.id, shopId: shop.shopId, role: 'owner', branchIds: [] },
      correlationId,
    );
  }
}
