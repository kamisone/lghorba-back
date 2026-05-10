import { z } from 'zod';

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

const CreateBookingBase = z.object({
  carId:         z.string().uuid(),
  startDateTime: z.string().regex(DATETIME_RE, 'Must be ISO datetime (YYYY-MM-DDTHH:mm)'),
  endDateTime:   z.string().regex(DATETIME_RE, 'Must be ISO datetime (YYYY-MM-DDTHH:mm)'),
  customerName:  z.string().min(1, 'Name is required').max(200),
  customerEmail: z.string().email('Enter a valid email address').optional(),
  customerPhone: z.string().min(6, 'Phone number is too short').max(30).regex(/^\+?[\d\s\-().]{6,30}$/, 'Invalid phone number'),
  // ── Delivery
  deliveryRequested:    z.boolean().optional(),
  deliveryAddress:      z.string().max(500).optional(),
  deliveryAddressLat:   z.number().min(-90).max(90).optional(),
  deliveryAddressLng:   z.number().min(-180).max(180).optional(),
  // ── Coupon
  couponCode:           z.string().min(1).max(50).optional(),
});

export const CreateBookingSchema = CreateBookingBase.refine(
  (d) => new Date(d.endDateTime) > new Date(d.startDateTime),
  { message: 'startDateTime must be before endDateTime', path: ['endDateTime'] },
);

export type CreateBookingDto = z.infer<typeof CreateBookingSchema>;
