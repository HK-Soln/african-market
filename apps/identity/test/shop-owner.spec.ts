import { randomInt, randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { EventBus } from '@am/core';
import { IdempotentConsumer, OutboxMessage, OutboxService } from '@am/database';
import { ShopMember, User } from '../src/entities';
import { ShopOwnerConsumer } from '../src/users/shop-owner.consumer';
import { createTestDatabase, TestDatabase } from './support/test-database';

describe('shop.created makes the creator its owner (Postgres)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let consumer: ShopOwnerConsumer;

  const newUser = async () =>
    db
      .getRepository(User)
      .save(db.getRepository(User).create({ phone: `+97155${randomInt(1_000_000, 9_999_999)}` }));
  const grant = (ownerId: string, shopId: string) =>
    db.transaction((manager) =>
      consumer.grantOwner(
        manager,
        { shopId, ownerId, name: 'Lagos Kitchen', slug: 'lagos-kitchen' },
        'req-9',
      ),
    );

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    consumer = new ShopOwnerConsumer(
      {} as EventBus,
      new IdempotentConsumer(db),
      new OutboxService('identity'),
    );
  }, 60_000);

  afterAll(() => testDb?.drop());

  it('adds the owner membership and the seller role, and announces the membership', async () => {
    const user = await newUser();
    const shopId = randomUUID();
    await grant(user.id, shopId);

    expect(await db.getRepository(ShopMember).findBy({ userId: user.id })).toEqual([
      expect.objectContaining({ shopId, role: 'owner', branchIds: [] }),
    ]);
    expect((await db.getRepository(User).findOneByOrFail({ id: user.id })).roles).toEqual([
      'customer',
      'seller',
    ]);
    const events = (
      await db.getRepository(OutboxMessage).findBy({ name: 'membership.changed' })
    ).filter((e) => (e.envelope as { payload: { userId: string } }).payload.userId === user.id);
    expect(events.map((e) => e.envelope)).toEqual([
      expect.objectContaining({
        correlationId: 'req-9',
        payload: { userId: user.id, shopId, role: 'owner', branchIds: [] },
      }),
    ]);
  });

  it('gives a second shop without doubling the role', async () => {
    const user = await newUser();
    await grant(user.id, randomUUID());
    await grant(user.id, randomUUID());
    expect(await db.getRepository(ShopMember).countBy({ userId: user.id })).toBe(2);
    expect((await db.getRepository(User).findOneByOrFail({ id: user.id })).roles).toEqual([
      'customer',
      'seller',
    ]);
  });

  it('does nothing for an account deleted in the meantime', async () => {
    const user = await newUser();
    await db.getRepository(User).softDelete({ id: user.id });
    await grant(user.id, randomUUID());
    expect(await db.getRepository(ShopMember).countBy({ userId: user.id })).toBe(0);
  });
});
