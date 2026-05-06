import { z } from 'zod';
import { CreateBookingAdminBaseSchema } from './create-booking-admin.dto';

// Derived from the base (no refinements) so .omit() and .partial() work in Zod v4.
export const UpdateBookingAdminSchema = CreateBookingAdminBaseSchema
  .omit({ carId: true })
  .partial();

export type UpdateBookingAdminDto = z.infer<typeof UpdateBookingAdminSchema>;
