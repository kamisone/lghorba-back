import { z } from 'zod';

// Base object without refinements — used by both create and update schemas.
export const CreateBookingAdminBaseSchema = z.object({
  carId:                  z.string().uuid('Invalid car ID'),
  startDateTime:          z.string().min(1),
  endDateTime:            z.string().min(1),
  source:                 z.enum(['private', 'turo', 'getaround']),
  status:                 z.enum(['pending', 'confirmed']).optional().default('confirmed'),
  // Guest resolution (turo/getaround)
  userId:                 z.string().uuid().nullish(),
  guestName:              z.string().nullish(),
  guestNumber:            z.string().nullish(),
  guestEmail:             z.string().email().nullish(),
  turoJoinDate:           z.string().nullish(),
  getaroundJoinDate:      z.string().nullish(),
  // Private booking customer (required when source='private', used to create/find User)
  customerName:           z.string().nullish(),
  customerPhone:          z.string().nullish(),
  customerEmail:          z.string().email().nullish(),
  // Platform metadata
  reservationNumber:      z.string().nullish(),
  totalEarning:           z.number().min(0).nullish(),
  // Calendar
  color:                  z.string().nullish(),
  autoStartTracking:      z.boolean().optional().default(false),
  gpsStopMode:            z.enum(['auto', 'manual']).optional().default('auto'),
});

// Create schema: adds private-booking validation on top of the base.
export const CreateBookingAdminSchema = CreateBookingAdminBaseSchema.superRefine((data, ctx) => {
  if (data.source === 'private') {
    if (!data.customerName?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['customerName'], message: 'Required for private bookings' });
    }
    if (!data.customerPhone?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['customerPhone'], message: 'Required for private bookings' });
    }
  }
});

export type CreateBookingAdminDto = z.infer<typeof CreateBookingAdminSchema>;
