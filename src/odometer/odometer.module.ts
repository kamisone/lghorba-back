import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OdometerReading } from './entities/odometer-reading.entity';
import { OdometerService } from './odometer.service';
import { OdometerController } from './odometer.controller';
import { FLEET_MAINTENANCE_QUEUE } from '../maintenance-jobs/maintenance-jobs.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([OdometerReading]),
    BullModule.registerQueue({ name: FLEET_MAINTENANCE_QUEUE }),
  ],
  controllers: [OdometerController],
  providers: [OdometerService],
  exports: [OdometerService],
})
export class OdometerModule {}
