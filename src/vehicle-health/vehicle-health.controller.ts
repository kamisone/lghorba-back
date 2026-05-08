import {
  Body, Controller, Get, Param, Put,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { VehicleHealthService } from './vehicle-health.service';
import { VehicleHealthStatus } from './entities/vehicle-health-record.entity';

const SetHealthSchema = z.object({
  status: z.enum(['healthy', 'warning', 'critical', 'unsafe', 'needs_service']),
  reason: z.string().max(500).optional(),
});

type SetHealthDto = z.infer<typeof SetHealthSchema>;

@Controller('vehicle-health')
export class VehicleHealthController {
  constructor(private readonly service: VehicleHealthService) {}

  @Get()
  getAll() {
    return this.service.getAll();
  }

  @Get(':carId')
  async getOne(@Param('carId') carId: string) {
    const status = await this.service.getHealthStatus(carId);
    const record = await this.service.getRecord(carId);
    return record ?? { carId, status: 'healthy' as VehicleHealthStatus, reason: null };
  }

  @Put(':carId')
  setHealth(
    @Param('carId') carId: string,
    @Body(new ZodValidationPipe(SetHealthSchema)) dto: SetHealthDto,
  ) {
    return this.service.setHealth(carId, dto.status, dto.reason);
  }
}
