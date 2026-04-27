import { z } from 'zod';
import { AdminRole } from '../admin.entity';

export const UpdateAdminSchema = z.object({
  name:  z.string().min(1).optional(),
  email: z.email().optional(),
  role:  z.enum(['admin', 'superadmin']).transform((v) => v as AdminRole).optional(),
});

export type UpdateAdminDto = z.infer<typeof UpdateAdminSchema>;
