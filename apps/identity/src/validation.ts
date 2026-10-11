import { z } from 'zod';
import { IdentityErrors } from '@am/contracts';
import { identityError } from './errors';

/** The gateway validates first; the service validates again before it persists anything. */
export function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (result.success) return result.data;
  throw identityError(IdentityErrors.validationFailed, {
    issues: result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    })),
  });
}

/** Shape only. Format and strength are checked by the services, which return specific codes. */
export const fields = {
  email: z.string().min(1).max(320),
  password: z.string().min(1).max(1024),
  code: z.string().min(1).max(12),
  locale: z.string().max(8).optional(),
  ip: z.string().max(64).optional(),
  correlationId: z.string().max(128).optional(),
  userAgent: z.string().max(2048).optional(),
  refreshToken: z.string().min(1).max(256),
  userId: z.string().uuid(),
};
