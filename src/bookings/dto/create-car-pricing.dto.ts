import { z } from 'zod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CarPricingBase = z.object({
  startDate:   z.string().regex(DATE_RE),
  endDate:     z.string().regex(DATE_RE),
  pricePerDay: z.number().positive(),
  label:       z.string().max(100).optional().nullable(),
});

export const CreateCarPricingSchema = CarPricingBase.refine(
  (d) => d.startDate <= d.endDate,
  { message: 'startDate must be <= endDate', path: ['endDate'] },
);

export type CreateCarPricingDto = z.infer<typeof CreateCarPricingSchema>;

export const UpdateCarPricingSchema = CarPricingBase.partial().refine(
  (d) => !d.startDate || !d.endDate || d.startDate <= d.endDate,
  { message: 'startDate must be <= endDate', path: ['endDate'] },
);

export type UpdateCarPricingDto = z.infer<typeof UpdateCarPricingSchema>;
