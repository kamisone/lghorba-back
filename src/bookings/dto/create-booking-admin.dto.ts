import { z } from 'zod';

export const CreateBookingAdminSchema = z.object({
  carId:                  z.uuid('Invalid car ID'),
  startDateTime:          z.string().min(1),
  endDateTime:            z.string().min(1),
  source:                 z.enum(['private', 'turo', 'getaround']),
  status:                 z.enum(['pending', 'confirmed']).optional().default('confirmed'),
  // Guest resolution (turo/getaround)
  userId:                 z.uuid().nullish(),
  guestName:              z.string().nullish(),
  guestNumber:            z.string().nullish(),
  guestEmail:             z.string().email().nullish(),
  turoJoinDate:           z.string().nullish(),
  getaroundJoinDate:      z.string().nullish(),
  // Private booking customer
  customerName:           z.string().nullish(),
  customerEmail:          z.string().email().nullish(),
  customerPhone:          z.string().nullish(),
  // Platform metadata
  reservationNumber:      z.string().nullish(),
  totalEarning:           z.number().min(0).nullish(),
  // Calendar
  color:                  z.string().nullish(),
  autoStartTracking:      z.boolean().optional().default(false),
});

export type CreateBookingAdminDto = z.infer<typeof CreateBookingAdminSchema>;
