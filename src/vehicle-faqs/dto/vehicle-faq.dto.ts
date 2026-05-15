import { z } from 'zod';

const text = (label: string, min: number, max: number) =>
  z.string().trim().min(min, `${label} must be at least ${min} characters`).max(max, `${label} exceeds ${max} characters`);

export const CreateVehicleFaqSchema = z.object({
  entityType: z.string().min(1).max(64).default('car'),
  entityId:   z.string().uuid('entityId must be a valid UUID'),
  question:   text('Question', 3, 500),
  answer:     text('Answer', 10, 5000),
  position:   z.number().int().nonnegative().optional(),
  isVisible:  z.boolean().optional().default(true),
});
export type CreateVehicleFaqDto = z.infer<typeof CreateVehicleFaqSchema>;

export const UpdateVehicleFaqSchema = z.object({
  question:  text('Question', 3, 500).optional(),
  answer:    text('Answer', 10, 5000).optional(),
  position:  z.number().int().nonnegative().optional(),
  isVisible: z.boolean().optional(),
});
export type UpdateVehicleFaqDto = z.infer<typeof UpdateVehicleFaqSchema>;

export const ReorderVehicleFaqsSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
});
export type ReorderVehicleFaqsDto = z.infer<typeof ReorderVehicleFaqsSchema>;
