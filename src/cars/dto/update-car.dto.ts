import { z } from 'zod';
import { CreateCarSchema } from './create-car.dto';

export const UpdateCarSchema = CreateCarSchema.partial();
export type UpdateCarDto = z.infer<typeof UpdateCarSchema>;
