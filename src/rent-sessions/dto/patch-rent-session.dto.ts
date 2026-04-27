import { z } from 'zod';
import { RentSessionStatus } from '../rent-session.entity';

export const PatchRentSessionSchema = z.object({
  status:                  z.enum(['active', 'ended']).transform((v) => v as RentSessionStatus).optional(),
  trackingPaused:          z.boolean().optional(),
  lastLocationRequestedAt: z.string().optional(),
});

export type PatchRentSessionDto = z.infer<typeof PatchRentSessionSchema>;
