import { z } from 'zod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const CreateBookingSchema = z
  .object({
    carId:         z.string().uuid(),
    startDate:     z.string().regex(DATE_RE, 'Must be YYYY-MM-DD'),
    endDate:       z.string().regex(DATE_RE, 'Must be YYYY-MM-DD'),
    customerName:  z.string().min(1).max(200).optional(),
    customerEmail: z.string().email().optional().or(z.literal('')),
    customerPhone: z.string().max(30).optional(),
  })
  .refine((d) => d.startDate < d.endDate, {
    message: 'startDate must be before endDate',
    path: ['endDate'],
  });

export type CreateBookingDto = z.infer<typeof CreateBookingSchema>;
