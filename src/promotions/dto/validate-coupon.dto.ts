import { z } from 'zod';

export const ValidateCouponSchema = z.object({
  code:          z.string().min(1).max(50),
  carId:         z.string().uuid(),
  startDateTime: z.string(),
  endDateTime:   z.string(),
  customerEmail: z.string().email().optional(),
});

export type ValidateCouponDto = z.infer<typeof ValidateCouponSchema>;
