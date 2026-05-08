import {
  Body, Controller, Delete, Get, HttpCode,
  Param, Post, Query,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { OdometerService } from './odometer.service';

const LogReadingSchema = z.object({
  carId:      z.string().uuid(),
  readingKm:  z.number().int().min(0),
  recordedAt: z.string().min(1),
  source:     z.enum(['manual','inspection','booking_return']).optional(),
  notes:      z.string().max(1000).optional(),
  createdBy:  z.string().max(200).optional(),
});

@Controller('odometer')
export class OdometerController {
  constructor(private readonly service: OdometerService) {}

  @Get()
  findAll(@Query('carId') carId?: string) {
    if (!carId) return [];
    return this.service.findByCarId(carId);
  }

  @Get('latest')
  findLatest(@Query('carId') carId: string) {
    return this.service.findLatest(carId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  logReading(@Body(new ZodValidationPipe(LogReadingSchema)) dto: z.infer<typeof LogReadingSchema>) {
    return this.service.logReading(dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
