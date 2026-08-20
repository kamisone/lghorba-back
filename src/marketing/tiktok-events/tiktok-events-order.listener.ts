import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../../commerce/entities/order.entity';
import { OrderItem } from '../../commerce/entities/order-item.entity';
import {
  COMMERCE_EVENTS,
  OrderCreatedEvent,
  PaymentSucceededEvent,
} from '../../commerce/events/commerce-events';
import { TikTokEventsService } from './tiktok-events.service';

/**
 * TikTok Events API — reacts to the same domain events MetaCapiOrderListener
 * does (a separate, independent listener — per this module's own rule in
 * commerce-events.ts, modules must not call each other directly).
 * ORDER_CREATED → InitiateCheckout, PAYMENT_SUCCEEDED → Purchase.
 */
@Injectable()
export class TikTokEventsOrderListener {
  private readonly logger = new Logger(TikTokEventsOrderListener.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,
    private readonly tiktokEvents: TikTokEventsService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.ORDER_CREATED)
  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    try {
      const order = await this.orderRepo.findOneBy({ id: event.orderId });
      if (!order) return;

      const items = await this.itemRepo.findBy({ orderId: event.orderId });

      await this.tiktokEvents.sendEvent({
        eventName: 'InitiateCheckout',
        // Same value the browser-side InitiateCheckout event uses as its
        // event ID — matches TikTok's dedup on (event, event_id).
        eventId: order.orderNumber,
        eventSourceUrl: `${process.env.APP_URL ?? ''}/${order.customerLocale ?? 'fr'}/shop/checkout`,
        properties: {
          contents: items.map((i) => ({
            content_id: i.variantId ?? i.productId ?? i.id,
            content_type: 'product',
            content_name: i.titleSnapshot,
            quantity: i.quantity,
            price: i.unitPriceCents / 100,
          })),
          value: order.totalCents / 100,
          currency: 'EUR',
        },
        email: order.customerEmail,
        clientIpAddress: order.clientIpAddress,
        clientUserAgent: order.clientUserAgent,
        ttclid: order.tiktokClickId,
        ttp: order.tiktokBrowserId,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send TikTok InitiateCheckout event for ${event.orderId}: ${(err as Error).message}`,
      );
    }
  }

  @OnEvent(COMMERCE_EVENTS.PAYMENT_SUCCEEDED)
  async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    try {
      const order = await this.orderRepo.findOneBy({ id: event.orderId });
      if (!order || !order.customerEmail) return;
      const items = await this.itemRepo.findBy({ orderId: event.orderId });
      if (!items.length) return;

      await this.tiktokEvents.sendEvent({
        eventName: 'Purchase',
        // Same value the browser-side Purchase event uses as its event ID.
        eventId: order.orderNumber,
        eventSourceUrl: `${process.env.APP_URL ?? ''}/${order.customerLocale ?? 'fr'}/shop/checkout/success?order=${order.orderNumber}`,
        properties: {
          contents: items.map((i) => ({
            content_id: i.variantId ?? i.productId ?? i.id,
            content_type: 'product',
            content_name: i.titleSnapshot,
            quantity: i.quantity,
            price: i.unitPriceCents / 100,
          })),
          value: order.totalCents / 100,
          currency: 'EUR',
        },
        email: order.customerEmail,
        clientIpAddress: order.clientIpAddress,
        clientUserAgent: order.clientUserAgent,
        ttclid: order.tiktokClickId,
        ttp: order.tiktokBrowserId,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send TikTok Purchase event for ${event.orderId}: ${(err as Error).message}`,
      );
    }
  }
}
