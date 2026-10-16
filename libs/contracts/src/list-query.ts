/**
 * One way to ask any list endpoint for filtered, sorted pages (decision T-21, F0-19):
 *
 *   GET /api/v1/admin/countries?filter[phoneEnabled]=true&filter[search][like]=nig
 *       &sort=sortOrder,-name&limit=20&cursor=eyJ2Ijp...
 *
 * - `filter[<field>]=<value>` is equality; `filter[<field>][<op>]=<value>` uses an operator:
 *   eq, ne, in (comma-separated), gte, lte, gt, lt, like (contains, case-insensitive).
 * - `sort` is a comma-separated list of fields, `-` for descending. The id is always the last key,
 *   so the order is total.
 * - `limit` is the page size (default 20, at most 100). `cursor` is an opaque token from a
 *   previous page's `nextCursor` or `prevCursor`: pages are found by the last row's sort values
 *   (keyset), never by offset, so they stay fast at any depth and do not skip or repeat rows when
 *   others are added.
 *
 * Each endpoint declares a ListSpec: which fields may be filtered (with which operators) and
 * sorted. Anything else is refused, so every query runs on a known, indexable column.
 */

export const FILTER_OPS = ['eq', 'ne', 'in', 'gte', 'lte', 'gt', 'lt', 'like'] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export type FilterType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'uuid';
export type FilterScalar = string | number | boolean;

export interface FilterSpec {
  type: FilterType;
  /** Allowed operators; `eq` when omitted. */
  ops?: readonly FilterOp[];
  /** For `enum`: the allowed values. */
  values?: readonly string[];
}

export interface ListSpec {
  filters: Readonly<Record<string, FilterSpec>>;
  /** Fields that may be sorted on. Each must be non-null in the database. */
  sorts: readonly string[];
  /** Used when the request gives no `sort`, e.g. `-createdAt`. */
  defaultSort: string;
  /** Default 20. */
  defaultLimit?: number;
  /** Default 100; never more than 100. */
  maxLimit?: number;
}

export interface FilterCondition {
  field: string;
  op: FilterOp;
  /** An array only for `in`. */
  value: FilterScalar | FilterScalar[];
}

export interface SortKey {
  field: string;
  direction: 'asc' | 'desc';
}

/** Where a page starts: after (next) or before (previous) a row's sort values. */
export interface Cursor {
  direction: 'after' | 'before';
  /** The sort keys' values of the row, in sort order, then its id. */
  values: Array<string | number | boolean>;
  id: string;
}

/** A validated list request, as the gateway passes it to a service over TCP. */
export interface ListQuery {
  filters: FilterCondition[];
  sort: SortKey[];
  limit: number;
  /** The encoded cursor, checked against `sort` when it is decoded. */
  cursor?: string;
}

/** One page of any list. */
export interface Page<T> {
  items: T[];
  /** Pass as `cursor` for the next page; null on the last one. */
  nextCursor: string | null;
  /** Pass as `cursor` for the page before; null on the first one. */
  prevCursor: string | null;
}

export const LIST_QUERY_INVALID = 'LIST_QUERY_INVALID';

/** A list request that does not follow the format or the endpoint's spec. */
export class ListQueryError extends Error {
  readonly code = LIST_QUERY_INVALID;
  constructor(
    readonly param: string,
    readonly reason: string,
  ) {
    super(`${param}: ${reason}`);
  }
}

const ABSOLUTE_MAX_LIMIT = 100;
const FILTER_KEY = /^filter\[([A-Za-z][A-Za-z0-9]*)\](?:\[([a-z]+)\])?$/;

/**
 * Turns the query string of a list request into a ListQuery, checked against the endpoint's spec.
 * Accepts the flat keys Express 5 gives (`filter[emirate]`) and nested objects from other
 * parsers (`{ filter: { emirate: ... } }`). Throws ListQueryError.
 */
export function parseListQuery(raw: Record<string, unknown>, spec: ListSpec): ListQuery {
  const filters: FilterCondition[] = [];
  for (const [key, value] of flatten(raw)) {
    if (key === 'sort' || key === 'limit' || key === 'cursor') continue;
    const match = FILTER_KEY.exec(key);
    if (!match) throw new ListQueryError(key, 'unknown parameter');
    const [, field, op = 'eq'] = match;
    filters.push({ field, op: op as FilterOp, value: one(key, value) });
  }
  return validateListQuery(
    {
      filters,
      sort: parseSort(raw.sort === undefined ? undefined : one('sort', raw.sort)),
      limit: raw.limit === undefined ? undefined : one('limit', raw.limit),
      cursor: raw.cursor === undefined ? undefined : one('cursor', raw.cursor),
    },
    spec,
  );
}

/**
 * Checks a structured ListQuery against a spec and converts filter values to their types. The
 * gateway calls it through parseListQuery; a service calls it again on what arrives over TCP.
 */
export function validateListQuery(
  input: {
    filters?: Array<{ field: string; op: string; value: unknown }>;
    sort?: SortKey[];
    limit?: unknown;
    cursor?: unknown;
  },
  spec: ListSpec,
): ListQuery {
  const filters = (input.filters ?? []).map(({ field, op, value }) => {
    const param = `filter[${field}]`;
    const filter = spec.filters[field];
    if (!filter) throw new ListQueryError(param, 'cannot filter on this field');
    if (!(FILTER_OPS as readonly string[]).includes(op))
      throw new ListQueryError(param, `unknown operator "${op}"`);
    if (!(filter.ops ?? ['eq']).includes(op as FilterOp))
      throw new ListQueryError(param, `operator "${op}" is not allowed here`);
    const parse = (item: unknown) => coerce(param, filter, item);
    const converted =
      op === 'in'
        ? (Array.isArray(value) ? value : String(value).split(',')).map(parse)
        : parse(value);
    if (op === 'in' && (converted as unknown[]).length > 100)
      throw new ListQueryError(param, 'at most 100 values');
    return { field, op: op as FilterOp, value: converted };
  });

  const sort = input.sort?.length ? input.sort : parseSort(spec.defaultSort);
  const seen = new Set<string>();
  for (const key of sort) {
    if (!spec.sorts.includes(key.field))
      throw new ListQueryError('sort', `cannot sort on "${key.field}"`);
    if (key.direction !== 'asc' && key.direction !== 'desc')
      throw new ListQueryError('sort', 'direction must be asc or desc');
    if (seen.has(key.field)) throw new ListQueryError('sort', `"${key.field}" given twice`);
    seen.add(key.field);
  }

  const maxLimit = Math.min(spec.maxLimit ?? ABSOLUTE_MAX_LIMIT, ABSOLUTE_MAX_LIMIT);
  let limit = spec.defaultLimit ?? 20;
  if (input.limit !== undefined && input.limit !== '') {
    limit = Number(input.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit)
      throw new ListQueryError('limit', `a whole number from 1 to ${maxLimit}`);
  }

  let cursor: string | undefined;
  if (input.cursor !== undefined && input.cursor !== '') {
    if (typeof input.cursor !== 'string') throw new ListQueryError('cursor', 'must be a string');
    decodeCursor(input.cursor, sort); // throws when it does not fit this sort
    cursor = input.cursor;
  }

  return { filters, sort, limit, cursor };
}

/** `sortOrder,-name` -> [{ sortOrder asc }, { name desc }]. */
export function parseSort(value: unknown): SortKey[] {
  if (value === undefined || value === '') return [];
  if (typeof value !== 'string') throw new ListQueryError('sort', 'must be a string');
  return value.split(',').map((part) => {
    const field = part.trim().replace(/^-/, '');
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(field))
      throw new ListQueryError('sort', `bad field "${part}"`);
    return { field, direction: part.trim().startsWith('-') ? 'desc' : 'asc' };
  });
}

/** The cursor is base64url JSON, bound to the sort it was made for. */
export function encodeCursor(cursor: Cursor, sort: SortKey[]): string {
  const json = JSON.stringify({
    d: cursor.direction === 'after' ? 'a' : 'b',
    s: sortSignature(sort),
    v: cursor.values,
    i: cursor.id,
  });
  return base64url(json);
}

export function decodeCursor(token: string, sort: SortKey[]): Cursor {
  let parsed: { d?: unknown; s?: unknown; v?: unknown; i?: unknown };
  try {
    parsed = JSON.parse(fromBase64url(token));
  } catch {
    throw new ListQueryError('cursor', 'not a cursor from this API');
  }
  if (
    (parsed.d !== 'a' && parsed.d !== 'b') ||
    typeof parsed.i !== 'string' ||
    !Array.isArray(parsed.v) ||
    !parsed.v.every((v) => ['string', 'number', 'boolean'].includes(typeof v))
  )
    throw new ListQueryError('cursor', 'not a cursor from this API');
  // Checked before the values: a cursor from another sort has a different number of them.
  if (parsed.s !== sortSignature(sort))
    throw new ListQueryError('cursor', 'made for another sort; start again without a cursor');
  if (parsed.v.length !== sort.length)
    throw new ListQueryError('cursor', 'not a cursor from this API');
  return { direction: parsed.d === 'a' ? 'after' : 'before', values: parsed.v, id: parsed.i };
}

const sortSignature = (sort: SortKey[]) =>
  sort.map((key) => `${key.direction === 'desc' ? '-' : ''}${key.field}`).join(',');

function coerce(param: string, filter: FilterSpec, value: unknown): FilterScalar {
  if (Array.isArray(value) || value === null || typeof value === 'object')
    throw new ListQueryError(param, 'must be a single value');
  const text = String(value);
  if (text.length > 200) throw new ListQueryError(param, 'too long');
  switch (filter.type) {
    case 'number': {
      const number = Number(text);
      if (text.trim() === '' || !Number.isFinite(number))
        throw new ListQueryError(param, 'must be a number');
      return number;
    }
    case 'boolean':
      if (text === 'true' || value === true) return true;
      if (text === 'false' || value === false) return false;
      throw new ListQueryError(param, 'must be true or false');
    case 'date':
      if (Number.isNaN(Date.parse(text)) || !/^\d{4}-\d{2}-\d{2}/.test(text))
        throw new ListQueryError(param, 'must be an ISO 8601 date');
      return new Date(text).toISOString();
    case 'uuid':
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text))
        throw new ListQueryError(param, 'must be a uuid');
      return text.toLowerCase();
    case 'enum':
      if (!filter.values?.includes(text))
        throw new ListQueryError(param, `must be one of ${(filter.values ?? []).join(', ')}`);
      return text;
    default:
      return text;
  }
}

/** A query value that may arrive once or repeated; lists are only allowed through `in`. */
function one(param: string, value: unknown): string {
  if (Array.isArray(value)) throw new ListQueryError(param, 'given more than once');
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean')
    throw new ListQueryError(param, 'must be a single value');
  return String(value);
}

/** `{ filter: { a: { gte: 1 } } }` -> [['filter[a][gte]', 1]]; flat keys pass through. */
function flatten(raw: Record<string, unknown>, prefix = ''): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(raw)) {
    const name = prefix ? `${prefix}[${key}]` : key;
    if (value && typeof value === 'object' && !Array.isArray(value))
      out.push(...flatten(value as Record<string, unknown>, name));
    else out.push([name, value]);
  }
  return out;
}

function base64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(token: string): string {
  if (!/^[A-Za-z0-9_-]{1,2048}$/.test(token)) throw new Error('not base64url');
  const binary = atob(token.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}
