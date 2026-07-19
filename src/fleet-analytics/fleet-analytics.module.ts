import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Car } from '../cars/car.entity';
import { Booking } from '../bookings/booking.entity';
import { Parking } from '../parkings/parking.entity';
import { MaintenanceRecord } from '../maintenance/entities/maintenance-record.entity';
import { OdometerReading } from '../odometer/entities/odometer-reading.entity';
import { VehicleHealthModule } from '../vehicle-health/vehicle-health.module';
import { VehicleAvailabilityModule } from '../vehicle-availability/vehicle-availability.module';
import { FleetAnalyticsService } from './fleet-analytics.service';
import { FleetAnalyticsController } from './fleet-analytics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Car,
      MaintenanceRecord,
      OdometerReading,
      Booking,
      Parking,
    ]),
    VehicleHealthModule,
    VehicleAvailabilityModule,
  ],
  controllers: [FleetAnalyticsController],
  providers: [FleetAnalyticsService],
})
export class FleetAnalyticsModule {}
