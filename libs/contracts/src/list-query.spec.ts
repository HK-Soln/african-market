import {
  decodeCursor,
  encodeCursor,
  ListQueryError,
  parseListQuery,
  validateListQuery,
  type ListSpec,
} from './list-query';

const spec: ListSpec = {
  filters: {
    emirate: { type: 'enum', values: ['DXB', 'AUH', 'SHJ'], ops: ['eq', 'in'] },
    rating: { type: 'number', ops: ['gte', 'lte'] },
    verified: { type: 'boolean' },
    name: { type: 'string', ops: ['eq', 'like'] },
    createdAt: { type: 'date', ops: ['gte', 'lt'] },
  },
  sorts: ['createdAt', 'name', 'rating'],
  defaultSort: '-createdAt',
};

const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    if (err instanceof ListQueryError) return `${err.param}: ${err.reason}`;
    throw err;
  }
  throw new Error('expected a ListQueryError');
};

describe('parseListQuery', () => {
  it('reads filters, operators, sort, limit and cursor from the flat keys Express gives', () => {
    const query = parseListQuery(
      {
        'filter[emirate][in]': 'DXB,SHJ',
        'filter[rating][gte]': '4',
        'filter[verified]': 'true',
        'filter[createdAt][gte]': '2026-01-01',
        sort: 'name,-rating',
        limit: '50',
      },
      spec,
    );
    expect(query).toEqual({
      filters: [
        { field: 'emirate', op: 'in', value: ['DXB', 'SHJ'] },
        { field: 'rating', op: 'gte', value: 4 },
        { field: 'verified', op: 'eq', value: true },
        { field: 'createdAt', op: 'gte', value: '2026-01-01T00:00:00.000Z' },
      ],
      sort: [
        { field: 'name', direction: 'asc' },
        { field: 'rating', direction: 'desc' },
      ],
      limit: 50,
      cursor: undefined,
    });
  });

  it('reads the same from nested objects (another query parser)', () => {
    const query = parseListQuery({ filter: { emirate: 'DXB', rating: { gte: '4' } } }, spec);
    expect(query.filters).toEqual([
      { field: 'emirate', op: 'eq', value: 'DXB' },
      { field: 'rating', op: 'gte', value: 4 },
    ]);
  });

  it('uses the default sort and a page of 20 when none is asked for', () => {
    expect(parseListQuery({}, spec)).toMatchObject({
      sort: [{ field: 'createdAt', direction: 'desc' }],
      limit: 20,
      filters: [],
    });
  });

  it.each([
    [{ 'filter[password]': 'x' }, 'filter[password]: cannot filter on this field'],
    [{ 'filter[rating]': '4' }, 'filter[rating]: operator "eq" is not allowed here'],
    [{ 'filter[name][regex]': 'x' }, 'filter[name]: unknown operator "regex"'],
    [{ 'filter[rating][gte]': 'high' }, 'filter[rating]: must be a number'],
    [{ 'filter[verified]': 'yes' }, 'filter[verified]: must be true or false'],
    [{ 'filter[emirate]': 'XXX' }, 'filter[emirate]: must be one of DXB, AUH, SHJ'],
    [{ 'filter[createdAt][gte]': 'yesterday' }, 'filter[createdAt]: must be an ISO 8601 date'],
    [{ sort: 'password' }, 'sort: cannot sort on "password"'],
    [{ sort: 'name,-name' }, 'sort: "name" given twice'],
    [{ limit: '0' }, 'limit: a whole number from 1 to 100'],
    [{ limit: '1000' }, 'limit: a whole number from 1 to 100'],
    [{ limit: ['10', '20'] }, 'limit: given more than once'],
    [{ cursor: 'not-a-cursor' }, 'cursor: not a cursor from this API'],
    [{ page: '2' }, 'page: unknown parameter'],
  ])('refuses %j', (raw, message) => {
    expect(refusal(() => parseListQuery(raw as Record<string, unknown>, spec))).toBe(message);
  });

  it('never allows a page larger than 100, whatever the spec says', () => {
    expect(refusal(() => parseListQuery({ limit: '500' }, { ...spec, maxLimit: 1000 }))).toBe(
      'limit: a whole number from 1 to 100',
    );
  });
});

describe('cursors', () => {
  const sort = [
    { field: 'name', direction: 'asc' as const },
    { field: 'rating', direction: 'desc' as const },
  ];

  it('round-trip, bound to their sort', () => {
    const token = encodeCursor({ direction: 'after', values: ['Nigeria', 4.5], id: 'abc' }, sort);
    expect(decodeCursor(token, sort)).toEqual({
      direction: 'after',
      values: ['Nigeria', 4.5],
      id: 'abc',
    });
    expect(() => decodeCursor(token, [{ field: 'name', direction: 'desc' }])).toThrow(
      'made for another sort',
    );
  });

  it('carry text in any language', () => {
    const token = encodeCursor({ direction: 'before', values: ['نيجيريا', 1], id: 'x' }, sort);
    expect(decodeCursor(token, sort).values[0]).toBe('نيجيريا');
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('are checked when a service validates the query again', () => {
    const token = encodeCursor({ direction: 'after', values: ['A', 1], id: 'x' }, sort);
    expect(
      validateListQuery({ sort, cursor: token, limit: 10 }, { ...spec, sorts: ['name', 'rating'] })
        .cursor,
    ).toBe(token);
    expect(
      refusal(() => validateListQuery({ cursor: token }, spec)), // default sort differs
    ).toBe('cursor: made for another sort; start again without a cursor');
  });
});
