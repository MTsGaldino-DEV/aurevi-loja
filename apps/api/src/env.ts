import { existsSync } from 'node:fs';
import { z } from 'zod';

if (existsSync('.env')) process.loadEnvFile('.env');

export const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    API_PORT: z.coerce.number().int().default(4000),
    ORDER_TOKEN_SECRET: z.string().min(32),
  })
  .parse(process.env);
