import { z } from 'zod';

export const CreateRentPositionSchema = z.object({
  lat:        z.number(),
  lng:        z.number(),
  rawMessage: z.string().optional(),
  recordedAt: z.coerce.date(),
});

export type CreateRentPositionDto = z.infer<typeof CreateRentPositionSchema>;
