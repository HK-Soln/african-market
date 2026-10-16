import {
  LIST_QUERY_INVALID,
  ListQueryError,
  validateListQuery,
  type ListQuery,
  type ListSpec,
} from '@am/contracts';
import { AppRpcException } from './rpc-error';

/**
 * Checks the ListQuery a list pattern received against the endpoint's spec, as every service must
 * for what arrives over TCP. A bad one becomes a 400 `LIST_QUERY_INVALID` for the gateway to pass
 * on, with `details.param` and `details.reason`.
 */
export function listQueryFromPayload(payload: unknown, spec: ListSpec): ListQuery {
  const query =
    typeof payload === 'object' && payload !== null && 'query' in payload
      ? (payload as { query: unknown }).query
      : undefined;
  try {
    return validateListQuery((query ?? {}) as Parameters<typeof validateListQuery>[0], spec);
  } catch (err) {
    if (err instanceof ListQueryError) {
      throw AppRpcException.badRequest(LIST_QUERY_INVALID, err.message, {
        param: err.param,
        reason: err.reason,
      });
    }
    throw err;
  }
}
