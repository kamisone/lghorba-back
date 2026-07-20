import { z } from 'zod';

export const CreateRentPositionSchema = z.object({
  lat:        z.number().finite().min(-90).max(90),
  lng:        z.number().finite().min(-180).max(180),
  rawMessage: z.string().optional(),
  recordedAt: z.coerce.date(),
});

export type CreateRentPositionDto = z.infer<typeof CreateRentPositionSchema>;
