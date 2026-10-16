/**
 * W3C trace context (`traceparent`, and `tracestate` when there is one) as plain strings: how a
 * trace crosses a hop that OpenTelemetry does not instrument by itself, a gateway → service TCP
 * call or an event in the outbox.
 */
export type TraceCarrier = Record<string, string>;

/**
 * The key the gateway adds to a TCP payload to carry its trace context. Services take it off
 * before the handler sees the payload (`RpcTraceInterceptor` in @am/core).
 */
export const TRACE_CONTEXT_KEY = '_trace';

// ── error reports ─────────────────────────────────────────────────────────────────────────────

/** Request headers an error report may keep; the rest (cookies, tokens, IPs) never leave. */
const SAFE_HEADER_NAMES = ['accept-language', 'content-type', 'user-agent'];
const SAFE_HEADERS = new Set(SAFE_HEADER_NAMES);

/**
 * What the Sentry SDKs may collect (their `dataCollection` option), in the backends and the Next
 * apps: no user fields, cookies, bodies, query strings, query data or local variables, and only
 * the safe headers. scrubErrorReport then checks every report again before it is sent.
 */
export const ERROR_REPORT_DATA_COLLECTION: {
  userInfo: boolean;
  cookies: boolean;
  httpHeaders: { allow: string[] };
  httpBodies: never[];
  urlQueryParams: boolean;
  databaseQueryData: boolean;
  queues: boolean;
  stackFrameVariables: boolean;
} = {
  userInfo: false,
  cookies: false,
  httpHeaders: { allow: SAFE_HEADER_NAMES },
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

interface ReportRequest {
  url?: string;
  headers?: Record<string, string>;
  cookies?: unknown;
  data?: unknown;
  query_string?: unknown;
  env?: unknown;
}

interface ReportBreadcrumb {
  data?: Record<string, unknown>;
}

/** The parts of a Sentry event (browser or Node) that can carry personal data. */
export interface ErrorReportLike {
  request?: ReportRequest;
  user?: { id?: string | number; [field: string]: unknown };
  breadcrumbs?: ReportBreadcrumb[];
}

/** A URL without its query string or fragment: searches and filters can hold names or phones. */
export const withoutQuery = (url: string): string => url.split(/[?#]/)[0];

/**
 * Takes out of an error report everything that can identify a person, before it is sent: the
 * request body, cookies, query strings and headers other than the safe few, and every user field
 * except the id. Error reporting services store data outside the UAE, so this runs on every
 * report (`beforeSend`) in the backends and in the three Next apps.
 */
export function scrubErrorReport<T extends ErrorReportLike>(report: T): T {
  const scrubbed: ErrorReportLike = { ...report };
  if (report.request) {
    const { url, headers } = report.request;
    scrubbed.request = {
      ...(url ? { url: withoutQuery(url) } : {}),
      ...(headers
        ? {
            headers: Object.fromEntries(
              Object.entries(headers).filter(([name]) => SAFE_HEADERS.has(name.toLowerCase())),
            ),
          }
        : {}),
    };
  }
  if (report.user) {
    scrubbed.user = report.user.id === undefined ? {} : { id: report.user.id };
  }
  if (report.breadcrumbs) {
    scrubbed.breadcrumbs = report.breadcrumbs.map(scrubBreadcrumb);
  }
  return scrubbed as T;
}

/** A breadcrumb (an HTTP call, a navigation) with the query string taken off its URLs. */
export function scrubBreadcrumb<T extends ReportBreadcrumb>(breadcrumb: T): T {
  if (!breadcrumb.data) return breadcrumb;
  const data = { ...breadcrumb.data };
  for (const key of ['url', 'from', 'to']) {
    if (typeof data[key] === 'string') data[key] = withoutQuery(data[key] as string);
  }
  delete data['http.query'];
  delete data['http.fragment'];
  return { ...breadcrumb, data };
}
