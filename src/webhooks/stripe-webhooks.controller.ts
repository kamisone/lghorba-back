import {
  BadRequestException, Controller, Headers, HttpCode, Logger, Post, RawBodyRequest, Req, Res,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { Public } from '../auth/public.decorator';
import { PaymentsService } from '../payments/payments.service';
import { BookingsService } from '../bookings/bookings.service';
import { ShopPaymentService } from '../commerce/payment/shop-payment.service';

/**
 * Single entry point for all Stripe webhook deliveries.
 *
 * Stripe dashboard endpoints:
 *   POST /webhooks/stripe/rentals  — rental booking payments
 *   POST /webhooks/stripe/shop     — shop order payments
 *
 * Each endpoint has its own signing secret in the Stripe dashboard.
 * Env vars:
 *   STRIPE_WEBHOOK_SECRET      — secret for /webhooks/stripe/rentals
 *   STRIPE_SHOP_WEBHOOK_SECRET — secret for /webhooks/stripe/shop
 *
 * Contract: always return HTTP 200 after successful signature verification so
 * Stripe does not retry. Invalid signatures get 400 (Stripe stops retrying those).
 */
@Public()
@Controller('webhooks/stripe')
export class StripeWebhooksController {
  private readonly logger = new Logger(StripeWebhooksController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly bookingsService:  BookingsService,
    private readonly shopPayment:      ShopPaymentService,
  ) {}

  // ── Rental booking payments ────────────────────────────────────────────────

  @Post('rentals')
  @HttpCode(200)
  async handleRentalWebhook(
    @Req()     req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig: string,
    @Res()     res: Response,
  ) {
    this.logger.log(`Stripe rental webhook — rawBody=${req.rawBody?.length ?? 0}B`);

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      this.logger.error('STRIPE_WEBHOOK_SECRET is not set');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    let event: ReturnType<typeof this.paymentsService.constructWebhookEvent>;
    try {
      event = this.paymentsService.constructWebhookEvent(req.rawBody!, sig);
    } catch (err) {
      this.logger.warn(`Rental webhook signature rejected: ${(err as Error).message}`);
      return res.status(400).json({ error: 'Invalid Stripe signature' });
    }

    try {
      const intent = event.data.object as { id: string };
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.bookingsService.confirmByPaymentIntent(intent.id);
          this.logger.log(`Rental webhook ${event.id}: booking confirmed for intent ${intent.id}`);
          break;
        case 'payment_intent.payment_failed':
        case 'payment_intent.canceled':
          await this.bookingsService.cancelByPaymentIntent(intent.id);
          this.logger.log(`Rental webhook ${event.id}: booking cancelled for intent ${intent.id}`);
          break;
        default:
          break;
      }
    } catch (err) {
      this.logger.error(
        `Rental webhook ${event.id} (${event.type}) processing failed — manual review needed`,
        (err as Error).message,
      );
    }

    return res.status(200).json({ received: true });
  }

  // ── Shop order payments ────────────────────────────────────────────────────

  @Post('shop')
  @HttpCode(200)
  async handleShopWebhook(
    @Req()     req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig: string,
    @Res()     res: Response,
  ) {
    this.logger.log(`Stripe shop webhook — rawBody=${req.rawBody?.length ?? 0}B`);

    if (!process.env.STRIPE_SHOP_WEBHOOK_SECRET) {
      this.logger.error('STRIPE_SHOP_WEBHOOK_SECRET is not set');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    try {
      await this.shopPayment.processWebhook(req.rawBody!, sig);
    } catch (err) {
      if (err instanceof BadRequestException) {
        this.logger.warn(`Shop webhook signature rejected — verify STRIPE_SHOP_WEBHOOK_SECRET: ${(err as Error).message}`);
        return res.status(400).json({ error: (err as BadRequestException).message });
      }
      this.logger.error('Shop webhook unexpected error', (err as Error).stack);
    }

    return res.status(200).json({ received: true });
  }
}
