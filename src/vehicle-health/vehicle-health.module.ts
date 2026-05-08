import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleHealthRecord } from './entities/vehicle-health-record.entity';
import { VehicleHealthService } from './vehicle-health.service';
import { VehicleHealthController } from './vehicle-health.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VehicleHealthRecord])],
  controllers: [VehicleHealthController],
  providers: [VehicleHealthService],
  exports: [VehicleHealthService],
})
export class VehicleHealthModule {}
