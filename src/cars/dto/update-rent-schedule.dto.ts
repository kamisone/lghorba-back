import { z } from 'zod';
import { CreateRentScheduleSchema } from './create-rent-schedule.dto';

export const UpdateRentScheduleSchema = CreateRentScheduleSchema.partial();
export type UpdateRentScheduleDto = z.infer<typeof UpdateRentScheduleSchema>;
