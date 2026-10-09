import { z } from 'zod';

export const gatewayEnvSchema = z.object({
  GATEWAY_PORT: z.coerce.number().default(4000),
  /** HS256 secret for access tokens, shared with identity. Production: from AWS Secrets Manager. */
  JWT_ACCESS_SECRET: z.string().min(32).default('dev-only-access-secret-change-me-0123456789'),
  /** Comma-separated origins of the three Next.js apps. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000,http://localhost:3001,http://localhost:3002'),
  /** Default request timeout to a service, in ms. */
  SERVICE_TIMEOUT_MS: z.coerce.number().default(5000),
});
export type GatewayEnv = z.infer<typeof gatewayEnvSchema>;
