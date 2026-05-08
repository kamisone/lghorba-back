import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceRecord } from './entities/maintenance-record.entity';
import { MaintenanceType } from './entities/maintenance-type.entity';
import { MaintenanceSupplier } from './entities/maintenance-supplier.entity';
import { VehicleAvailabilityModule } from '../vehicle-availability/vehicle-availability.module';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([MaintenanceRecord, MaintenanceType, MaintenanceSupplier]),
    VehicleAvailabilityModule,
  ],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
  exports: [MaintenanceService],
})
export class MaintenanceModule {}
