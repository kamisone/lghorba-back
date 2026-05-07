import { z } from 'zod';

const VehicleAvailabilityBaseSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
  reason:    z.string().max(200).nullable().optional(),
  notes:     z.string().max(2000).nullable().optional(),
});

export const CreateVehicleAvailabilitySchema = VehicleAvailabilityBaseSchema.superRefine((d, ctx) => {
  if (d.startDate && d.endDate && d.startDate > d.endDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate must be ≥ startDate' });
  }
});

export const UpdateVehicleAvailabilitySchema = VehicleAvailabilityBaseSchema.partial();

export type CreateVehicleAvailabilityDto = z.infer<typeof CreateVehicleAvailabilitySchema>;
export type UpdateVehicleAvailabilityDto = z.infer<typeof UpdateVehicleAvailabilitySchema>;
