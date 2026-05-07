import {
  Body, Controller, Delete, Get, HttpCode,
  Param, Patch, Post, Query, Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { VehicleAvailabilityService } from './vehicle-availability.service';
import {
  CreateVehicleAvailabilityDto, CreateVehicleAvailabilitySchema,
  UpdateVehicleAvailabilityDto, UpdateVehicleAvailabilitySchema,
} from './dto/vehicle-availability.dto';

@Controller('cars/:carId/availability')
export class VehicleAvailabilityController {
  constructor(private readonly svc: VehicleAvailabilityService) {}

  @Get()
  findAll(
    @Param('carId') carId: string,
    @Query('from') from?: string,
    @Query('to')   to?: string,
  ) {
    return this.svc.findByCarAndRange(carId, from, to);
  }

  @Post()
  create(
    @Param('carId') carId: string,
    @Body(new ZodValidationPipe(CreateVehicleAvailabilitySchema)) dto: CreateVehicleAvailabilityDto,
    @Req() req: Request & { user?: { sub?: string } },
  ) {
    return this.svc.create(carId, dto, req.user?.sub);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateVehicleAvailabilitySchema)) dto: UpdateVehicleAvailabilityDto,
  ) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string) {
    await this.svc.remove(id);
  }
}
