import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

export function parseOrBadRequest<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new BadRequestException(result.error.issues[0]?.message ?? 'Dados inválidos');
}
