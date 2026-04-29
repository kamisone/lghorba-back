import { Inject, Injectable, Logger } from '@nestjs/common';
import Stripe = require('stripe');
import { STRIPE_CLIENT } from './stripe.provider';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe.Stripe) {}

  async createPaymentIntent(
    amountEuros: number,
    bookingId: string,
    idempotencyKey: string,
  ): Promise<{ paymentIntentId: string; clientSecret: string }> {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount:   Math.round(amountEuros * 100),
        currency: 'eur',
        metadata: { bookingId },
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey },
    );

    return {
      paymentIntentId: intent.id,
      clientSecret:    intent.client_secret,
    };
  }

  // Return type is inferred — avoids the Stripe.Event namespace problem
  constructWebhookEvent(rawBody: Buffer, signature: string) {
    return this.stripe.webhooks.constructEvent(
      rawBody as unknown as Uint8Array,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? '',
    );
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<void> {
    try {
      await this.stripe.paymentIntents.cancel(paymentIntentId);
    } catch (err) {
      this.logger.warn(`Could not cancel PaymentIntent ${paymentIntentId}: ${(err as Error)?.message}`);
    }
  }
}
