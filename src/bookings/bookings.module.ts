import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Car } from '../cars/car.entity';
import { CarPricing } from '../cars/car-pricing.entity';
import { CarDeliveryLocation } from '../cars/car-delivery-location.entity';
import { DistributedLockService } from '../common/lock/distributed-lock.service';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';
import { UsersModule } from '../users/users.module';
import { VehicleAvailabilityModule } from '../vehicle-availability/vehicle-availability.module';
import { VehicleHealthModule } from '../vehicle-health/vehicle-health.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { SmsModule } from '../sms/sms.module';
import { RentSession } from '../rent-sessions/rent-session.entity';
import { Booking } from './booking.entity';
import { BookingsService } from './bookings.service';
import { BookingsAdminController, CarPricingsController, PublicBookingsController } from './bookings.controller';
import { BOOKING_EXPIRATION_QUEUE } from './booking-expiration.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, Car, CarPricing, CarDeliveryLocation, RentSession]),
    BullModule.registerQueue({ name: BOOKING_EXPIRATION_QUEUE }),
    UsersModule,
    VehicleAvailabilityModule,
    VehicleHealthModule,
    PromotionsModule,
    SmsModule,
  ],
  controllers: [PublicBookingsController, BookingsAdminController, CarPricingsController],
  providers: [BookingsService, DistributedLockService, IdempotencyInterceptor],
  exports:   [BookingsService],
})
export class BookingsModule {}
