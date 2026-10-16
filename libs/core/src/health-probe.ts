/** Liveness checks: a service's `/health` and the gateway's `/api/v1/health`. */
export const isHealthProbe = (req: { method?: string; url?: string }): boolean =>
  req.method === 'GET' && /^(\/api\/v1)?\/health\/?(\?.*)?$/.test(req.url ?? '');
