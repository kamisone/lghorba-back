import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';
import { stripeProvider } from './stripe.provider';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports:     [BookingsModule],
  providers:   [stripeProvider, PaymentsService, IdempotencyInterceptor],
  controllers: [PaymentsController],
  exports:     [stripeProvider, PaymentsService],
})
export class PaymentsModule {}