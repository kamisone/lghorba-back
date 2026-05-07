import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VehicleAvailability } from './vehicle-availability.entity';
import { VehicleAvailabilityService } from './vehicle-availability.service';
import { VehicleAvailabilityController } from './vehicle-availability.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VehicleAvailability])],
  controllers: [VehicleAvailabilityController],
  providers: [VehicleAvailabilityService],
  exports: [VehicleAvailabilityService],
})
export class VehicleAvailabilityModule {}
