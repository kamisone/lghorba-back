import { z } from 'zod';

export const CreateRentSessionSchema = z.object({
  carId:      z.uuid('Invalid car ID'),
  scheduleId: z.uuid().optional(),
});

export type CreateRentSessionDto = z.infer<typeof CreateRentSessionSchema>;
