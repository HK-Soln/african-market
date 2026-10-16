import {
  applyDecorators,
  BadRequestException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';
import {
  LIST_QUERY_INVALID,
  ListQueryError,
  parseListQuery,
  type ListQuery,
  type ListSpec,
} from '@am/contracts';

/**
 * The list request of a route, read from the query string and checked against the route's spec
 * (the standard list format, decision T-21). A bad one is a 400 `LIST_QUERY_INVALID` with
 * `details.param` and `details.reason`, before any service is called.
 *
 *   @Get()
 *   @ApiListQuery(SHOP_LIST_SPEC)
 *   list(@ListQueryParams(SHOP_LIST_SPEC) query: ListQuery) { ... }
 */
export const ListQueryParams = createParamDecorator(
  (spec: ListSpec, context: ExecutionContext): ListQuery => {
    const request = context.switchToHttp().getRequest<Request>();
    try {
      return parseListQuery(request.query as Record<string, unknown>, spec);
    } catch (err) {
      if (err instanceof ListQueryError) {
        throw new BadRequestException({
          code: LIST_QUERY_INVALID,
          message: err.message,
          details: { param: err.param, reason: err.reason },
        });
      }
      throw err;
    }
  },
);

/** Documents a route's list parameters in OpenAPI, so the generated client knows each one. */
export function ApiListQuery(spec: ListSpec) {
  const filters = Object.entries(spec.filters).flatMap(([field, filter]) =>
    (filter.ops ?? ['eq']).map((op) =>
      ApiQuery({
        name: op === 'eq' ? `filter[${field}]` : `filter[${field}][${op}]`,
        required: false,
        description: `${filter.type}${filter.values ? ` (${filter.values.join(', ')})` : ''}${
          op === 'in' ? ', comma-separated' : op === 'like' ? ', contains, case-insensitive' : ''
        }`,
        schema:
          filter.type === 'boolean' && op === 'eq'
            ? { type: 'boolean' }
            : filter.type === 'number' && op !== 'in'
              ? { type: 'number' }
              : { type: 'string' },
      }),
    ),
  );
  return applyDecorators(
    ...filters,
    ApiQuery({
      name: 'sort',
      required: false,
      description: `Comma-separated, \`-\` for descending. Fields: ${spec.sorts.join(', ')}. Default: ${spec.defaultSort}.`,
      schema: { type: 'string' },
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      description: `Page size, default ${spec.defaultLimit ?? 20}, at most ${Math.min(spec.maxLimit ?? 100, 100)}.`,
      schema: { type: 'integer', minimum: 1, maximum: Math.min(spec.maxLimit ?? 100, 100) },
    }),
    ApiQuery({
      name: 'cursor',
      required: false,
      description: 'A `nextCursor` or `prevCursor` from the previous page.',
      schema: { type: 'string' },
    }),
  );
}
