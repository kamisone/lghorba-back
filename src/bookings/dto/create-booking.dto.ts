import { z } from 'zod';

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

const CreateBookingBase = z.object({
  carId:         z.string().uuid(),
  startDateTime: z.string().regex(DATETIME_RE, 'Must be ISO datetime (YYYY-MM-DDTHH:mm)'),
  endDateTime:   z.string().regex(DATETIME_RE, 'Must be ISO datetime (YYYY-MM-DDTHH:mm)'),
  customerName:  z.string().min(1, 'Name is required').max(200),
  customerEmail: z.string().email('Enter a valid email address'),
  customerPhone: z.string().min(1, 'Phone number is required').max(30),
});

export const CreateBookingSchema = CreateBookingBase.refine(
  (d) => new Date(d.endDateTime) > new Date(d.startDateTime),
  { message: 'startDateTime must be before endDateTime', path: ['endDateTime'] },
);

export type CreateBookingDto = z.infer<typeof CreateBookingSchema>;
