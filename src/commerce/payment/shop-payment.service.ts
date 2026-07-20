import {
  BadRequestException, Inject, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import Stripe = require('stripe');
import { STRIPE_CLIENT } from '../../payments/stripe.provider';
import { Order } from '../entities/order.entity';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { OrdersService } from '../orders/orders.service';
import { TestCheckoutGuard } from '../shared/test-checkout-guard.service';
import { CommerceEventBus } from '../events/commerce-event-bus.service';
import { COMMERCE_EVENTS } from '../events/commerce-events';

@Injectable()
export class ShopPaymentService {
  private readonly logger = new Logger(ShopPaymentService.name);

  constructor(
    @Inject(STRIPE_CLIENT)
    private readonly stripe: Stripe.Stripe,
    @InjectRepository(Order)               private readonly orderRepo: Repository<Order>,
    private readonly ordersService:     OrdersService,
    private readonly testCheckoutGuard: TestCheckoutGuard,
    private readonly eventBus:          CommerceEventBus,
    private readonly dataSource:        DataSource,
  ) {}

  // ── Create payment intent for a shop order ──────────────────────────────────

  async createPaymentIntent(orderId: string): Promise<{ clientSecret: string; paymentIntentId: string }> {
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) throw new NotFoundException('Order not found');

    // The storefront is already stopped at readyForPayment, but this route is
    // also reachable directly via POST /public/shop/payment/intent, which skips
    // it. Re-check here so no path can mint an intent for a test product.
    await this.testCheckoutGuard.assertCheckoutAllowed(order);

    if (order.status !== 'awaiting_payment') {
      throw new BadRequestException(`Order status "${order.status}" does not require payment`);
    }

    // Reuse existing intent if already created
    if (order.paymentIntentId) {
      const existing = await this.stripe.paymentIntents.retrieve(order.paymentIntentId);
      if (existing.status !== 'canceled') {
        return { clientSecret: existing.client_secret!, paymentIntentId: existing.id };
      }
    }

    const intent = await this.stripe.paymentIntents.create(
      {
        amount:   order.totalCents,
        currency: 'eur',
        metadata: {
          orderId:     order.id,
          orderNumber: order.orderNumber,
          platform:    'lghorba-shop',
        },
      },
      { idempotencyKey: `shop-order-${order.id}` },
    );

    order.paymentIntentId = intent.id;
    await this.orderRepo.save(order);

    return { clientSecret: intent.client_secret!, paymentIntentId: intent.id };
  }

  // ── Process Stripe webhook ──────────────────────────────────────────────────

  async processWebhook(rawBody: Buffer, signature: string): Promise<void> {
    // Each Stripe webhook endpoint has its own signing secret.
    // The shop endpoint uses STRIPE_SHOP_WEBHOOK_SECRET (not the rental STRIPE_WEBHOOK_SECRET).
    const webhookSecret = process.env.STRIPE_SHOP_WEBHOOK_SECRET!;
    let event: ReturnType<typeof this.stripe.webhooks.constructEvent>;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody as unknown as Uint8Array, signature, webhookSecret);
    } catch {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }

    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object as Record<string, any>;
      const orderId = intent['metadata']?.orderId as string | undefined;
      if (!orderId) {
        this.logger.warn(`Webhook ${event.id}: payment_intent.succeeded has no orderId in metadata`);
        return;
      }

      const order = await this.orderRepo.findOneBy({ id: orderId });
      if (!order) {
        this.logger.warn(`Webhook ${event.id}: order ${orderId} not found`);
        return;
      }

      const isNew = await this.recordTransactionIdempotent({
        orderId,
        provider:              'stripe',
        providerTransactionId: intent['id'] as string,
        webhookEventId:        event.id,
        type:                  'charge',
        status:                'succeeded',
        amountCents:           intent['amount'] as number,
        currency:              (intent['currency'] as string).toUpperCase(),
        metadata:              { intentId: intent['id'] },
      });
      if (!isNew) {
        this.logger.debug(`Webhook ${event.id}: already processed (idempotent skip)`);
        return;
      }

      try {
        await this.ordersService.confirmPayment(orderId, intent['id'] as string);
        this.logger.log(`Webhook ${event.id}: order ${orderId} confirmed as paid`);
      } catch (err) {
        this.logger.error(
          `Webhook ${event.id}: confirmPayment failed for order ${orderId} (status="${order.status}") — manual review needed`,
          (err as Error).message,
        );
        return;
      }

      this.eventBus.emit(
        COMMERCE_EVENTS.PAYMENT_SUCCEEDED,
        { orderId, paymentIntentId: intent['id'] as string, amountCents: intent['amount'] as number },
        { entityId: orderId, source: 'ShopPaymentService.webhook' },
      );
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Record<string, any>;
      const orderId = intent['metadata']?.orderId as string | undefined;
      if (!orderId) return;

      const isNew = await this.recordTransactionIdempotent({
        orderId,
        provider:              'stripe',
        providerTransactionId: intent['id'] as string,
        webhookEventId:        event.id,
        type:                  'charge',
        status:                'failed',
        amountCents:           intent['amount'] as number,
        currency:              (intent['currency'] as string).toUpperCase(),
        metadata:              null,
      });
      if (!isNew) return;

      // C3: Release inventory by cancelling the order immediately on payment failure.
      // Without this, the order stays in awaiting_payment until the 30-min expiry job fires.
      const order = await this.orderRepo.findOneBy({ id: orderId });
      if (order && (order.status === 'draft' || order.status === 'awaiting_payment')) {
        try {
          await this.ordersService.transition(order.id, 'cancelled', 'Payment failed — inventory released');
        } catch (err) {
          this.logger.warn(`Could not cancel order ${orderId} on payment failure: ${(err as Error).message}`);
        }
      }

      this.eventBus.emit(
        COMMERCE_EVENTS.PAYMENT_FAILED,
        { orderId, paymentIntentId: intent['id'] as string },
        { entityId: orderId, source: 'ShopPaymentService.webhook' },
      );
    }

    if (event.type === 'charge.refunded') {
      const charge = event.data.object as Record<string, any>;
      const paymentIntentId = charge['payment_intent'] as string;
      const order = await this.orderRepo.findOneBy({ paymentIntentId });
      if (!order) return;

      const isNew = await this.recordTransactionIdempotent({
        orderId:               order.id,
        provider:              'stripe',
        providerTransactionId: charge['id'] as string,
        webhookEventId:        event.id,
        type:                  'refund',
        status:                'succeeded',
        amountCents:           charge['amount_refunded'] as number,
        currency:              (charge['currency'] as string).toUpperCase(),
        metadata:              null,
      });
      if (!isNew) return;

      if (order.status !== 'refunded') {
        await this.ordersService.transition(order.id, 'refunded', 'Refunded via Stripe');
      }
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // Inserts a PaymentTransaction record within a transaction to prevent concurrent
  // duplicate insertions. Returns false if the webhookEventId was already recorded.
  private async recordTransactionIdempotent(
    data: Partial<PaymentTransaction>,
  ): Promise<boolean> {
    let isNew = true;
    try {
      await this.dataSource.transaction(async (em) => {
        const dup = await em.getRepository(PaymentTransaction).findOneBy({ webhookEventId: data.webhookEventId });
        if (dup) { isNew = false; return; }
        await em.save(PaymentTransaction, em.create(PaymentTransaction, data));
      });
    } catch (err: any) {
      if (err.code === '23505') return false; // unique constraint: concurrent delivery
      throw err;
    }
    return isNew;
  }
}
