import { z } from 'zod';

export const CreateRentScheduleSchema = z.object({
  fromDate:           z.string().min(1, 'fromDate is required'),
  toDate:             z.string().min(1, 'toDate is required'),
  guestName:          z.string().nullish(),
  guestNumber:        z.string().nullish(),
  reservationNumber:  z.string().nullish(),
  totalEarning:       z.number().min(0).nullish(),
  autoStartTracking:  z.boolean().optional(),
  color:              z.string().nullish(),
  guestEmail:         z.email().nullish(),
  turoJoinDate:       z.string().nullish(),
  getaroundJoinDate:  z.string().nullish(),
  userId:             z.uuid().nullish(),
});

export type CreateRentScheduleDto = z.infer<typeof CreateRentScheduleSchema>;
