import { existsSync } from 'node:fs';
import { z } from 'zod';

if (existsSync('.env')) process.loadEnvFile('.env');

export const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    API_PORT: z.coerce.number().int().default(4000),
    ORDER_TOKEN_SECRET: z.string().min(32),
    MP_ACCESS_TOKEN: z.string().min(1),
    // Optional so the store runs before the panel generates it. Without it, webhooks are refused.
    MP_WEBHOOK_SECRET: z.string().min(1).optional(),
    MELHOR_ENVIO_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
    MELHOR_ENVIO_CLIENT_ID: z.string().regex(/^\d+$/).optional(),
    MELHOR_ENVIO_CLIENT_SECRET: z.string().min(1).optional(),
    MELHOR_ENVIO_REDIRECT_URI: z.url().optional(),
    MELHOR_ENVIO_USER_AGENT: z
      .string()
      .regex(/^[^\r\n]+\([^\s@]+@[^\s@]+\)$/)
      .optional(),
    INTEGRATION_ENCRYPTION_KEY: z
      .string()
      .regex(/^[a-fA-F0-9]{64}$/)
      .optional(),
  })
  .parse(process.env);
