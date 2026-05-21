import {
  Body, Controller, Delete, Get, HttpCode,
  Param, Patch, Post, Query,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ParkingService } from './parking.service';

const PhoneSchema = z.object({
  phoneNumber: z.string().min(1).max(50),
  label: z.string().max(100).nullish(),
  sortOrder: z.number().int().min(0).optional(),
});

const CreateParkingSchema = z.object({
  label:              z.string().min(1).max(200),
  address:            z.string().min(1),
  city:               z.string().max(100).nullish(),
  latitude:           z.number().min(-90).max(90).nullish(),
  longitude:          z.number().min(-180).max(180).nullish(),
  monthlyRentEur:     z.number().min(0).nullish(),
  cautionEur:         z.number().min(0).nullish(),
  paymentDueDay:      z.number().int().min(1).max(31).nullish(),
  ownerName:          z.string().max(200).nullish(),
  status:             z.enum(['active','inactive','maintenance','blocked']).optional(),
  parkingType:        z.enum(['covered','outdoor','underground','garage','street','other']).nullish(),
  accessInstructions: z.string().nullish(),
  pedestrianCode:     z.string().max(100).nullish(),
  gateCode:           z.string().max(100).nullish(),
  dimensionNotes:     z.string().nullish(),
  comments:           z.string().nullish(),
  isActive:           z.boolean().optional(),
  ownerPhones:        z.array(PhoneSchema).optional(),
});

const UpdateParkingSchema = CreateParkingSchema.partial();

@Controller('admin/parkings')
export class ParkingController {
  constructor(private readonly service: ParkingService) {}

  @Get()
  findAll(
    @Query('status')   status?: string,
    @Query('city')     city?: string,
    @Query('isActive') isActive?: string,
    @Query('search')   search?: string,
  ) {
    return this.service.findAll({
      status: status as any,
      city,
      isActive: isActive === undefined ? undefined : isActive === 'true',
      search,
    });
  }

  @Get('analytics')
  getAnalytics() {
    return this.service.getAnalytics();
  }

  @Get('cities')
  getCities() {
    return this.service.getCities();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateParkingSchema)) dto: z.infer<typeof CreateParkingSchema>) {
    return this.service.create(dto as any);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateParkingSchema)) dto: z.infer<typeof UpdateParkingSchema>,
  ) {
    return this.service.update(id, dto as any);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post(':id/cars/:carId/assign')
  @HttpCode(200)
  assignCar(@Param('id') id: string, @Param('carId') carId: string) {
    return this.service.assignCar(id, carId);
  }

  @Delete(':id/cars/:carId/assign')
  @HttpCode(204)
  unassignCar(@Param('carId') carId: string) {
    return this.service.unassignCar(carId);
  }
}
