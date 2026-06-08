import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { BookingsModule } from '../bookings/bookings.module';
import { CommerceModule } from '../commerce/commerce.module';
import { StripeWebhooksController } from './stripe-webhooks.controller';

@Module({
  imports: [PaymentsModule, BookingsModule, CommerceModule],
  controllers: [StripeWebhooksController],
})
export class WebhooksModule {}
