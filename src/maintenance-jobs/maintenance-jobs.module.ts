import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DlqModule } from '../dlq/dlq.module';
import { FLEET_MAINTENANCE_QUEUE } from './maintenance-jobs.constants';
import { MaintenanceRecord } from '../maintenance/entities/maintenance-record.entity';
import { MaintenanceType } from '../maintenance/entities/maintenance-type.entity';
import { OdometerReading } from '../odometer/entities/odometer-reading.entity';
import { VehicleHealthModule } from '../vehicle-health/vehicle-health.module';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { MaintenanceJobsProcessor } from './maintenance-jobs.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: FLEET_MAINTENANCE_QUEUE }),
    DlqModule,
    TypeOrmModule.forFeature([MaintenanceRecord, MaintenanceType, OdometerReading]),
    VehicleHealthModule,
    MaintenanceModule,
  ],
  providers: [MaintenanceJobsProcessor],
})
export class MaintenanceJobsModule {}
