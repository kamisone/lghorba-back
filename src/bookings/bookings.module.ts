import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Car } from '../cars/car.entity';
import { CarPricing } from '../cars/car-pricing.entity';
import { DistributedLockService } from '../common/lock/distributed-lock.service';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';
import { Booking } from './booking.entity';
import { BookingsService } from './bookings.service';
import { BookingsAdminController, CarPricingsController, PublicBookingsController } from './bookings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, Car, CarPricing])],
  controllers: [PublicBookingsController, BookingsAdminController, CarPricingsController],
  providers: [BookingsService, DistributedLockService, IdempotencyInterceptor],
  exports:   [BookingsService],
})
export class BookingsModule {}
