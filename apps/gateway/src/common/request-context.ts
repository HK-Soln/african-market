import type { Request } from 'express';
import { isLocale, Locale } from '@am/i18n';

/** The first language in Accept-Language, when it is one we support. */
export function requestLocale(req: Request): Locale | undefined {
  const header = req.headers['accept-language'];
  const first =
    typeof header === 'string'
      ? header.split(',')[0]?.trim().split(/[-;]/)[0]?.toLowerCase()
      : undefined;
  return first && isLocale(first) ? first : undefined;
}

/** Where the request came from, for rate limits and the session record. */
export function requestOrigin(req: Request): { ip?: string; userAgent?: string } {
  const userAgent = req.headers['user-agent'];
  return { ip: req.ip, userAgent: typeof userAgent === 'string' ? userAgent : undefined };
}

/** The request id pino assigned (or took from `x-request-id`), carried onto events. */
export function correlationId(req: Request): string | undefined {
  const id = (req as Request & { id?: unknown }).id;
  return typeof id === 'string' && id.length <= 128 ? id : undefined;
}
