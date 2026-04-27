import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Car } from '../cars/car.entity';
import { CarPricing } from '../cars/car-pricing.entity';
import { Booking } from './booking.entity';
import { BookingsService } from './bookings.service';
import { BookingsAdminController, CarPricingsController, PublicBookingsController } from './bookings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, Car, CarPricing])],
  controllers: [PublicBookingsController, BookingsAdminController, CarPricingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
