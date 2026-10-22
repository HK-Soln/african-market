export type Result<T> =
  { ok: true; data: T } | { ok: false; code: string; details?: Record<string, unknown> };

/** Turns a gateway call into data or an error code the screens can put into words. */
export async function run<T>(
  request: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<Result<T>> {
  try {
    const { data, error, response } = await request;
    if (response.ok) return { ok: true, data: data as T };
    const body = (error ?? {}) as { code?: string; details?: Record<string, unknown> };
    return {
      ok: false,
      code: body.code ?? (response.status === 429 ? 'RATE_LIMITED' : 'UNKNOWN'),
      details: body.details,
    };
  } catch {
    return { ok: false, code: 'NETWORK_ERROR' };
  }
}
