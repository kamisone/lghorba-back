import { z } from 'zod';

export const ValidateDeliverySchema = z.object({
  addressLat:   z.number().min(-90).max(90),
  addressLng:   z.number().min(-180).max(180),
  addressLabel: z.string().min(1).max(500),
});

export type ValidateDeliveryDto = z.infer<typeof ValidateDeliverySchema>;
