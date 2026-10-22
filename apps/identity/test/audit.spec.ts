import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AUDIT_LIST_SPEC, IdentityErrors, parseListQuery } from '@am/contracts';
import { AuditService } from '../src/audit/audit.service';
import { User } from '../src/entities';
import { createTestDatabase, TestDatabase } from './support/test-database';

const q = (raw: Record<string, string> = {}) => parseListQuery(raw, AUDIT_LIST_SPEC);

/** The admin audit log: entries from events, kept once, listed newest first with names. */
describe('admin audit log (PostGIS)', () => {
  let testDb: TestDatabase;
  let db: DataSource;
  let audit: AuditService;
  let adminId: string;
  const admin = () => ({ userId: adminId, roles: ['customer', 'admin'], shops: [] });
  const shopId = randomUUID();

  beforeAll(async () => {
    testDb = await createTestDatabase();
    db = testDb.db;
    audit = new AuditService(db);
    const user = await db
      .getRepository(User)
      .save(
        db.getRepository(User).create({ phone: '+971501119001', name: 'Amal', roles: ['admin'] }),
      );
    adminId = user.id;
  }, 60_000);

  afterAll(async () => {
    await testDb?.drop();
  });

  it('keeps an event delivered twice as one entry, and lists newest first with the admin', async () => {
    const eventId = randomUUID();
    const record = {
      actorId: adminId,
      action: 'shop.listing_suspended' as const,
      subjectType: 'shop' as const,
      subjectId: shopId,
      shopId,
      details: { reason: 'Fake reviews' },
    };
    const origin = {
      id: eventId,
      source: 'shops',
      occurredAt: new Date('2026-10-20T08:00:00Z'),
      correlationId: 'req-1',
    };
    await audit.record(db.manager, record, origin);
    await audit.record(db.manager, record, origin);
    await audit.record(
      db.manager,
      { ...record, action: 'shop.listing_reinstated', details: { reason: null } },
      { source: 'shops', occurredAt: new Date('2026-10-21T08:00:00Z') },
    );

    const page = await audit.list(admin(), q({ 'filter[shopId]': shopId }));
    expect(page.items.map((e) => e.action)).toEqual([
      'shop.listing_reinstated',
      'shop.listing_suspended',
    ]);
    expect(page.items[1]).toMatchObject({
      id: eventId,
      source: 'shops',
      actorName: 'Amal',
      details: { reason: 'Fake reviews' },
      correlationId: 'req-1',
      occurredAt: '2026-10-20T08:00:00.000Z',
    });
  });

  it('filters by action and pages with a cursor', async () => {
    for (let i = 0; i < 3; i++) {
      await audit.record(
        db.manager,
        {
          actorId: null,
          action: 'search.rebuilt',
          subjectType: 'search',
          subjectId: 'index',
          shopId: null,
          details: { shops: i },
        },
        { source: 'discovery', occurredAt: new Date(Date.UTC(2026, 9, 22, 8, i)) },
      );
    }
    const first = await audit.list(admin(), q({ 'filter[action]': 'search.rebuilt', limit: '2' }));
    expect(first.items.map((e) => e.details.shops)).toEqual([2, 1]);
    expect(first.items[0].actorName).toBeNull();
    const second = await audit.list(
      admin(),
      q({ 'filter[action]': 'search.rebuilt', limit: '2', cursor: first.nextCursor! }),
    );
    expect(second.items.map((e) => e.details.shops)).toEqual([0]);
  });

  it('is for admins only', async () => {
    const error = await audit.list({ roles: ['customer', 'seller'] }, q()).then(
      () => null,
      (err: { getError: () => { code: string } }) => err.getError(),
    );
    expect(error?.code).toBe(IdentityErrors.adminOnly);
  });
});
