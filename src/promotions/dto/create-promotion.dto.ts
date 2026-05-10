import { z } from 'zod';

const PromotionBaseSchema = z.object({
  code:                 z.string().min(1).max(50).transform(v => v.toUpperCase()).nullable().optional().default(null),
  name:                 z.string().min(1).max(200),
  description:          z.string().max(1000).nullable().optional().default(null),
  type:                 z.enum(['percentage', 'fixed_amount', 'free_delivery']),
  value:                z.number().min(0).default(0),
  isActive:             z.boolean().default(true),
  isAutomatic:          z.boolean().default(false),
  isStackable:          z.boolean().default(false),
  isFirstBookingOnly:   z.boolean().default(false),
  startsAt:             z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:Z.+-]{4,})?$/, 'Invalid date').nullable().optional().default(null),
  expiresAt:            z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:Z.+-]{4,})?$/, 'Invalid date').nullable().optional().default(null),
  maxUsages:            z.number().int().positive().nullable().optional().default(null),
  maxUsagesPerCustomer: z.number().int().positive().nullable().optional().default(null),
  minBookingAmount:     z.number().min(0).nullable().optional().default(null),
  minBookingDays:       z.number().int().positive().nullable().optional().default(null),
  maxDiscountAmount:    z.number().min(0).nullable().optional().default(null),
  applicableCarIds:     z.array(z.string().uuid()).nullable().optional().default(null),
});

export const CreatePromotionSchema = PromotionBaseSchema.refine(
  d => d.type !== 'percentage' || (d.value >= 0 && d.value <= 100),
  { message: 'Percentage value must be between 0 and 100', path: ['value'] },
);

export type CreatePromotionDto = z.infer<typeof CreatePromotionSchema>;

export const UpdatePromotionSchema = PromotionBaseSchema.partial();
export type UpdatePromotionDto = z.infer<typeof UpdatePromotionSchema>;
