import { z } from 'zod';

export const ExecuteGuestActionSchema = z.object({
  action: z.enum(['open', 'close', 'parking'] as const),
});

export type ExecuteGuestActionDto = z.infer<typeof ExecuteGuestActionSchema>;
