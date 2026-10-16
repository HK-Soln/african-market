import { Brackets, ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  decodeCursor,
  encodeCursor,
  type FilterCondition,
  type ListQuery,
  type Page,
  type SortKey,
} from '@am/contracts';

/**
 * Runs a validated ListQuery (`@am/contracts`, decision T-21) as one keyset query and returns a
 * page with its cursors.
 *
 *   const page = await findPage(repo.createQueryBuilder('c'), query, {
 *     columns: { sortOrder: 'c.sort_order', name: "c.name->>'en'", enabled: 'c.phone_enabled' },
 *     id: 'c.id',
 *   });
 *
 * `columns` maps each field of the endpoint's ListSpec to a SQL expression on the builder's alias.
 * Sort columns must be non-null, and should be indexed together with the id for large tables.
 * The builder may already carry conditions of its own (a shop's products, a user's orders): they
 * are kept, the list's filters are added to them.
 */
export async function findPage<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  query: ListQuery,
  options: { columns: Readonly<Record<string, string>>; id: string },
): Promise<Page<T>> {
  const column = (field: string) => {
    const sql = options.columns[field];
    // The spec and the columns are written together; a gap is a programming error.
    if (!sql) throw new Error(`findPage: no column for "${field}"`);
    return sql;
  };

  applyFilters(qb, query.filters, column);

  const cursor = query.cursor ? decodeCursor(query.cursor, query.sort) : undefined;
  const backwards = cursor?.direction === 'before';
  // Walking backwards is walking forwards in the reversed order, then reversing the page.
  const keys: Array<SortKey & { sql: string; alias: string }> = [
    ...query.sort.map((key, i) => ({ ...key, sql: column(key.field), alias: `list_sort_${i}` })),
    { field: 'id', direction: 'asc' as const, sql: options.id, alias: 'list_sort_id' },
  ].map((key) => ({ ...key, direction: backwards ? flip(key.direction) : key.direction }));

  // In parentheses: TypeORM would take a bare `s.id` for the entity's own column and lose it.
  keys.forEach((key) => qb.addSelect(`(${key.sql})`, key.alias));

  if (cursor) {
    const values = [...cursor.values, cursor.id];
    // (k1 > v1) OR (k1 = v1 AND k2 > v2) OR ...: works whatever mix of directions.
    qb.andWhere(
      new Brackets((outer) => {
        keys.forEach((key, i) => {
          outer.orWhere(
            new Brackets((inner) => {
              for (let j = 0; j < i; j++) {
                inner.andWhere(`${keys[j].sql} = :list_c${j}`, { [`list_c${j}`]: values[j] });
              }
              inner.andWhere(`${key.sql} ${key.direction === 'asc' ? '>' : '<'} :list_c${i}`, {
                [`list_c${i}`]: values[i],
              });
            }),
          );
        });
      }),
    );
  }

  keys.forEach((key, i) => {
    const direction = key.direction === 'asc' ? 'ASC' : 'DESC';
    if (i === 0) qb.orderBy(key.alias, direction);
    else qb.addOrderBy(key.alias, direction);
  });
  qb.limit(query.limit + 1);

  const { entities, raw } = await qb.getRawAndEntities();
  const more = entities.length > query.limit;
  let rows = entities.slice(0, query.limit).map((entity, i) => ({ entity, raw: raw[i] }));
  if (backwards) rows = rows.reverse();

  // Cursors are built from the selected sort values, in the request's (not reversed) order.
  const forward = query.sort;
  const at = (row: (typeof rows)[number], direction: 'after' | 'before') =>
    encodeCursor(
      {
        direction,
        values: forward.map((_, i) => scalar(row.raw[`list_sort_${i}`])),
        id: String(row.raw.list_sort_id),
      },
      forward,
    );

  const first = rows[0];
  const last = rows[rows.length - 1];
  return {
    items: rows.map((row) => row.entity),
    nextCursor: last && (backwards || more) ? at(last, 'after') : null,
    prevCursor: first && (backwards ? more : Boolean(cursor)) ? at(first, 'before') : null,
  };
}

function applyFilters<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  filters: FilterCondition[],
  column: (field: string) => string,
): void {
  filters.forEach((filter, i) => {
    const sql = column(filter.field);
    const name = `list_f${i}`;
    switch (filter.op) {
      case 'in':
        qb.andWhere(`${sql} IN (:...${name})`, { [name]: filter.value });
        break;
      case 'like':
        qb.andWhere(`${sql} ILIKE :${name} ESCAPE '\\'`, {
          [name]: `%${String(filter.value).replace(/[\\%_]/g, '\\$&')}%`,
        });
        break;
      default:
        qb.andWhere(`${sql} ${OPERATORS[filter.op]} :${name}`, { [name]: filter.value });
    }
  });
}

const OPERATORS = { eq: '=', ne: '<>', gte: '>=', lte: '<=', gt: '>', lt: '<' } as const;

const flip = (direction: 'asc' | 'desc') => (direction === 'asc' ? 'desc' : 'asc');

/** A selected value as the cursor carries it: dates as ISO text, numbers as numbers. */
function scalar(value: unknown): string | number | boolean {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string')
    return value;
  return String(value);
}
