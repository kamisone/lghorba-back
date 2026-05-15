import { z } from 'zod';

export const VEHICLE_TYPES = [
  '4x4', 'SUV', 'Sedan', 'Estate', 'Convertible',
  'City car', 'Cut', 'Minivan', 'Commercial vehicle',
] as const;

export const ENERGY_TYPES   = ['Petrol', 'Diesel', 'Hybrid', 'Electric'] as const;
export const GEARBOX_TYPES  = ['Manual', 'Automatic'] as const;
export const MILEAGE_RANGES = ['0-50', '50-100', '100-150', '150-200', '200-250', '250-300', '300+'] as const;

const DeliveryLocationSchema = z.object({
  label:    z.string().min(1).max(200),
  address:  z.string().min(1).max(500),
  // pg driver returns DECIMAL/NUMERIC as strings — coerce handles both string and number
  lat:      z.coerce.number().min(-90).max(90),
  lng:      z.coerce.number().min(-180).max(180),
  radiusKm: z.coerce.number().positive().max(50).optional(),
  price:    z.coerce.number().min(0).nullish(),
});

export type DeliveryLocationInput = z.infer<typeof DeliveryLocationSchema>;

export const CreateCarSchema = z.object({
  // ── Required
  name:            z.string().min(1, 'Name is required'),
  immatriculation: z.string().min(1, 'Plate is required'),
  phoneNumber:     z.string().min(1, 'Phone number is required'),
  brand:           z.string().min(1, 'Brand is required'),
  model:           z.string().min(1, 'Model is required'),
  finishing:       z.string().min(1, 'Finishing is required'),
  modelYear:       z.number().int().min(1900, 'Invalid year'),
  color:           z.string().min(1, 'Color is required'),
  energy:          z.enum(ENERGY_TYPES,  'Energy is required'),
  gearbox:         z.enum(GEARBOX_TYPES, 'Gearbox is required'),
  numberOfDoors:   z.number().int().min(2).max(6),
  numberOfSeats:   z.number().int().min(1).max(9),
  basePricePerDay: z.number().positive('Base price per day is required'),
  // ── Optional
  basePricePerWeekendDay: z.number().positive().nullish(),
  description:      z.string().nullish(),
  vehicleType:      z.enum(VEHICLE_TYPES).nullish(),
  din:              z.number().int().min(0).nullish(),
  mileage:          z.enum(MILEAGE_RANGES).nullish(),
  vehicleCondition: z.string().nullish(),
  // ── Parking
  parkingAddress:   z.string().max(500).nullish(),
  parkingLat:       z.number().min(-90).max(90).nullish(),
  parkingLng:       z.number().min(-180).max(180).nullish(),
  // ── Delivery
  deliveryEnabled:      z.boolean().optional(),
  deliveryType:         z.enum(['radius', 'location']).nullish(),
  deliveryRadiusKm:     z.number().positive().nullish(),
  deliveryRadiusPrice:  z.number().min(0).nullish(),
  deliveryLocations:    z.array(DeliveryLocationSchema).max(10, 'Maximum 10 delivery locations').nullish(),
  // ── Platform links
  turoLink:       z.string().max(2048).regex(/^https?:\/\/.+/, 'Must be a valid URL').nullish(),
  getaroundLink:  z.string().max(2048).regex(/^https?:\/\/.+/, 'Must be a valid URL').nullish(),
});

export type CreateCarDto = z.infer<typeof CreateCarSchema>;
