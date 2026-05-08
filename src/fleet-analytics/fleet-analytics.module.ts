import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Car } from '../cars/car.entity';
import { MaintenanceRecord } from '../maintenance/entities/maintenance-record.entity';
import { OdometerReading } from '../odometer/entities/odometer-reading.entity';
import { VehicleHealthModule } from '../vehicle-health/vehicle-health.module';
import { FleetAnalyticsService } from './fleet-analytics.service';
import { FleetAnalyticsController } from './fleet-analytics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Car, MaintenanceRecord, OdometerReading]),
    VehicleHealthModule,
  ],
  controllers: [FleetAnalyticsController],
  providers: [FleetAnalyticsService],
})
export class FleetAnalyticsModule {}
