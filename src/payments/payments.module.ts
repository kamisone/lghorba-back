import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { BillingModule } from '../billing/billing.module';
import { IdempotencyInterceptor } from '../common/idempotency/idempotency.interceptor';
import { stripeProvider } from './stripe.provider';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports:     [BookingsModule, BillingModule],
  providers:   [stripeProvider, PaymentsService, IdempotencyInterceptor],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
