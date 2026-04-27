import { z } from 'zod';

export const CreateUserSchema = z.object({
  name:              z.string().min(1, 'Name is required'),
  phone:             z.string().nullish(),
  email:             z.email().nullish(),
  score:             z.number().int().min(1).max(10).nullish(),
  turoJoinDate:      z.string().nullish(),
  getaroundJoinDate: z.string().nullish(),
  rentSessionId:     z.uuid('Invalid rent session ID'),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
