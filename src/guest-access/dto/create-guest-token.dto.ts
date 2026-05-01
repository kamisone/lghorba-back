import { z } from 'zod';
import { GUEST_ACTIONS } from '../entities/guest-token.entity';

export const CreateGuestTokenSchema = z.object({
  carId:          z.string().uuid(),
  bookingId:      z.string().uuid().nullable().optional(),
  label:          z.string().max(200).nullable().optional(),
  allowedActions: z.array(z.enum(['open', 'close', 'parking'] as const)).min(1),
  expiresAt:      z.string().datetime({ offset: true }),
});

export type CreateGuestTokenDto = z.infer<typeof CreateGuestTokenSchema>;
