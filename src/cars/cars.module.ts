import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { memoryStorage } from 'multer';
import { Booking } from '../bookings/booking.entity';
import { GcsModule } from '../gcs/gcs.module';
import { RentSession } from '../rent-sessions/rent-session.entity';
import { TranslationsModule } from '../translations/translations.module';
import { UsersModule } from '../users/users.module';
import { VehicleAvailabilityModule } from '../vehicle-availability/vehicle-availability.module';
import { VehicleHealthModule } from '../vehicle-health/vehicle-health.module';
import { Parking } from '../parkings/parking.entity';
import { CarDeliveryLocation } from './car-delivery-location.entity';
import { CarPhoto } from './car-photo.entity';
import { Car } from './car.entity';
import { CarsController } from './cars.controller';
import { CarsService } from './cars.service';
import { PublicCarsController } from './public-cars.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Car, CarPhoto, CarDeliveryLocation, RentSession, Booking, Parking]),
    MulterModule.register({
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        cb(null, file.mimetype.startsWith('image/'));
      },
    }),
    GcsModule,
    UsersModule,
    TranslationsModule,
    VehicleAvailabilityModule,
    VehicleHealthModule,
  ],
  controllers: [CarsController, PublicCarsController],
  providers: [CarsService],
})
export class CarsModule {}
