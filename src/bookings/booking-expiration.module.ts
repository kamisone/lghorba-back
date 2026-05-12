import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DlqModule } from '../dlq/dlq.module';
import { stripeProvider } from '../payments/stripe.provider';
import { BookingsModule } from './bookings.module';
import { BOOKING_EXPIRATION_QUEUE } from './booking-expiration.constants';
import { BookingExpirationProcessor } from './booking-expiration.processor';

@Module({
  imports: [
    BookingsModule,
    BullModule.registerQueue({ name: BOOKING_EXPIRATION_QUEUE }),
    DlqModule,
  ],
  providers: [
    stripeProvider,
    BookingExpirationProcessor,
  ],
})
export class BookingExpirationModule {}
