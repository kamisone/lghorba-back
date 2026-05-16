import { z } from 'zod';

export const CreateUserSchema = z.object({
  name:              z.string().min(1, 'Name is required'),
  phone:             z.string().nullish(),
  email:             z.email().nullish(),
  score:             z.number().int().min(1).max(10).nullish(),
  turoJoinDate:      z.string().nullish(),
  getaroundJoinDate: z.string().nullish(),
  platformProfileUrl: z.string().max(2048).regex(/^https?:\/\/.+/, 'Must be a valid URL').nullish(),
  rentSessionId:     z.uuid('Invalid rent session ID'),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
