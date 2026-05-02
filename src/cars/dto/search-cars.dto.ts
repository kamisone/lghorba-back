import { z } from 'zod';

export const SearchCarsSchema = z.object({
  startDateTime: z.string().datetime({ offset: true }),
  endDateTime:   z.string().datetime({ offset: true }),
  addressLat:    z.number().min(-90).max(90).optional(),
  addressLng:    z.number().min(-180).max(180).optional(),
  addressLabel:  z.string().min(1).max(500).optional(),
});

export type SearchCarsDto = z.infer<typeof SearchCarsSchema>;
