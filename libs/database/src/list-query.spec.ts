import { Column, Entity, PrimaryColumn } from 'typeorm';
import { parseListQuery, type ListSpec, type Page } from '@am/contracts';
import { findPage } from './list-query';
import { createTestDatabase, type TestDatabase } from './testing';

const SCHEMA = 'list_test';

/** A small table with repeated sort values, where keyset pages go wrong if they are going to. */
@Entity({ schema: SCHEMA, name: 'shop' })
class Shop {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('text')
  name!: string;

  @Column('text')
  emirate!: string;

  @Column('numeric', { transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
  rating!: number;

  @Column('timestamptz', { name: 'created_at' })
  createdAt!: Date;
}

const spec: ListSpec = {
  filters: {
    emirate: { type: 'enum', values: ['DXB', 'SHJ', 'AJM'], ops: ['eq', 'in'] },
    rating: { type: 'number', ops: ['gte', 'lt'] },
    name: { type: 'string', ops: ['like'] },
    createdAt: { type: 'date', ops: ['gte'] },
  },
  sorts: ['name', 'rating', 'createdAt'],
  defaultSort: '-createdAt',
};

const columns = {
  name: 's.name',
  emirate: 's.emirate',
  rating: 's.rating',
  createdAt: 's.created_at',
};

// 23 shops: names repeat in threes, ratings in fives, three share a creation time.
const EMIRATES = ['DXB', 'SHJ', 'AJM'];
const rows = Array.from({ length: 23 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  name: `Shop ${String.fromCharCode(65 + Math.floor(i / 3))}`,
  emirate: EMIRATES[i % 3],
  rating: 3 + (i % 5) / 2,
  createdAt: new Date(Date.UTC(2026, 0, 1 + (i < 3 ? 0 : i))),
}));

describe('findPage (keyset pagination on PostGIS)', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await createTestDatabase({
      schema: SCHEMA,
      entities: [Shop],
      setup: async (runner) => {
        await runner.query(`CREATE TABLE ${SCHEMA}.shop (
          id uuid PRIMARY KEY, name text NOT NULL, emirate text NOT NULL,
          rating numeric NOT NULL, created_at timestamptz NOT NULL)`);
        for (const row of rows) {
          await runner.query(`INSERT INTO ${SCHEMA}.shop VALUES ($1, $2, $3, $4, $5)`, [
            row.id,
            row.name,
            row.emirate,
            row.rating,
            row.createdAt,
          ]);
        }
      },
    });
  }, 60_000);

  afterAll(() => testDb?.drop());

  const page = (raw: Record<string, unknown>) =>
    findPage(testDb.db.getRepository(Shop).createQueryBuilder('s'), parseListQuery(raw, spec), {
      columns,
      id: 's.id',
    });

  /** Every page from the first, following nextCursor. */
  async function walk(raw: Record<string, unknown>): Promise<Array<Page<Shop>>> {
    const pages = [await page(raw)];
    while (pages[pages.length - 1].nextCursor) {
      pages.push(await page({ ...raw, cursor: pages[pages.length - 1].nextCursor }));
    }
    return pages;
  }

  /** The order Postgres would give for the whole table, for comparison. */
  const expected = (compare: (a: (typeof rows)[number], b: (typeof rows)[number]) => number) =>
    [...rows].sort((a, b) => compare(a, b) || a.id.localeCompare(b.id)).map((r) => r.id);

  it.each([
    ['name', (a: (typeof rows)[number], b: (typeof rows)[number]) => a.name.localeCompare(b.name)],
    [
      '-rating,name',
      (a: (typeof rows)[number], b: (typeof rows)[number]) =>
        b.rating - a.rating || a.name.localeCompare(b.name),
    ],
    [
      '-createdAt',
      (a: (typeof rows)[number], b: (typeof rows)[number]) =>
        b.createdAt.getTime() - a.createdAt.getTime(),
    ],
    [
      'rating,-name',
      (a: (typeof rows)[number], b: (typeof rows)[number]) =>
        a.rating - b.rating || b.name.localeCompare(a.name),
    ],
  ])('walks every row once, in order, sorted by %s', async (sort, compare) => {
    const pages = await walk({ sort, limit: '4' });
    expect(pages).toHaveLength(6); // 23 rows, 4 a page
    expect(pages.flatMap((p) => p.items.map((s) => s.id))).toEqual(expected(compare));
    expect(pages[0].prevCursor).toBeNull();
    expect(pages[5].nextCursor).toBeNull();
    expect(pages[5].items).toHaveLength(3);
  });

  it('walks back with prevCursor to exactly the pages it came through', async () => {
    const forward = await walk({ sort: '-rating,name', limit: '5' });
    let current = forward[forward.length - 1];
    for (let i = forward.length - 2; i >= 0; i--) {
      expect(current.prevCursor).not.toBeNull();
      current = await page({ sort: '-rating,name', limit: '5', cursor: current.prevCursor });
      expect(current.items.map((s) => s.id)).toEqual(forward[i].items.map((s) => s.id));
    }
    expect(current.prevCursor).toBeNull();
  });

  it('does not skip or repeat a row when one is added in front of the reader', async () => {
    const first = await page({ sort: 'name', limit: '6' });
    await testDb.db.query(`INSERT INTO ${SCHEMA}.shop VALUES ($1, 'Shop A', 'DXB', 4, now())`, [
      '00000000-0000-4000-8000-000000000999',
    ]);
    try {
      const second = await page({ sort: 'name', limit: '6', cursor: first.nextCursor });
      // With an offset the new row would push the 6th row onto page 2 again.
      expect(second.items[0].name).toBe('Shop C');
      expect(second.items.map((s) => s.id)).not.toContain(first.items[5].id);
    } finally {
      await testDb.db.query(`DELETE FROM ${SCHEMA}.shop WHERE id = $1`, [
        '00000000-0000-4000-8000-000000000999',
      ]);
    }
  });

  it('filters with every operator the spec allows', async () => {
    const dubai = await walk({ 'filter[emirate]': 'DXB', limit: '100' });
    expect(dubai[0].items.every((s) => s.emirate === 'DXB')).toBe(true);
    expect(dubai[0].items).toHaveLength(8);

    const north = await page({
      'filter[emirate][in]': 'SHJ,AJM',
      'filter[rating][gte]': '4',
      limit: '100',
    });
    expect(north.items.every((s) => s.emirate !== 'DXB' && s.rating >= 4)).toBe(true);
    expect(north.items).toHaveLength(
      rows.filter((r) => r.emirate !== 'DXB' && r.rating >= 4).length,
    );

    const recent = await page({ 'filter[createdAt][gte]': '2026-01-20', limit: '100' });
    expect(recent.items.map((s) => s.id)).toEqual(
      expected((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).filter((id) =>
        rows.find((r) => r.id === id && r.createdAt >= new Date('2026-01-20')),
      ),
    );
  });

  it('treats % and _ in a search as plain text', async () => {
    expect((await page({ 'filter[name][like]': 'shop b' })).items).toHaveLength(3);
    expect((await page({ 'filter[name][like]': '%' })).items).toHaveLength(0);
    expect((await page({ 'filter[name][like]': 'Sh_p' })).items).toHaveLength(0);
  });

  it('keeps conditions the caller put on the builder', async () => {
    const qb = testDb.db
      .getRepository(Shop)
      .createQueryBuilder('s')
      .where('s.emirate = :e', { e: 'AJM' });
    const result = await findPage(
      qb,
      parseListQuery({ 'filter[rating][lt]': '4', limit: '100' }, spec),
      {
        columns,
        id: 's.id',
      },
    );
    expect(result.items.every((s) => s.emirate === 'AJM' && s.rating < 4)).toBe(true);
    expect(result.items.length).toBeGreaterThan(0);
  });
});
