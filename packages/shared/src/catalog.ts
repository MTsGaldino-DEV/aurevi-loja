import { z } from 'zod';

export const sizeChartSchema = z
  .object({
    columns: z.array(z.string().min(1)).min(1),
    rows: z
      .array(z.object({ size: z.string().min(1), values: z.array(z.number().positive()) }))
      .min(1),
  })
  .refine((chart) => chart.rows.every((row) => row.values.length === chart.columns.length), {
    message: 'Each row needs one value per column',
  });
export type SizeChart = z.infer<typeof sizeChartSchema>;
