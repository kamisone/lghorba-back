import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Car } from '../cars/car.entity';
import { Parking } from './parking.entity';
import { ParkingOwnerPhone } from './parking-owner-phone.entity';
import { ParkingDocument } from './parking-document.entity';
import { ParkingController } from './parking.controller';
import { ParkingService } from './parking.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Parking, ParkingOwnerPhone, ParkingDocument, Car]),
  ],
  controllers: [ParkingController],
  providers: [ParkingService],
  exports: [ParkingService],
})
export class ParkingModule {}
