import { z } from 'zod';
import { CreateBookingAdminSchema } from './create-booking-admin.dto';

export const UpdateBookingAdminSchema = CreateBookingAdminSchema
  .omit({ carId: true })
  .partial();

export type UpdateBookingAdminDto = z.infer<typeof UpdateBookingAdminSchema>;
