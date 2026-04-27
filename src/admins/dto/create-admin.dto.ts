import { z } from 'zod';
import { AdminRole } from '../admin.entity';

export const CreateAdminSchema = z.object({
  name:     z.string().min(1, 'Name is required'),
  email:    z.email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role:     z.enum(['admin', 'superadmin']).transform((v) => v as AdminRole).optional(),
});

export type CreateAdminDto = z.infer<typeof CreateAdminSchema>;
