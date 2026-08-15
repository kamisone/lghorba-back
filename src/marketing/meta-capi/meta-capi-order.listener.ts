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
import { MetaCapiService } from './meta-capi.service';
import { BehaviorTrackingService } from '../../commerce/behavior/behavior-tracking.service';
import { GeoIpService } from '../../commerce/behavior/geo-ip.service';
import { deviceFromUserAgent } from '../../common/utils/device.util';

/**
 * Meta Conversions API — reacts to the same domain events ShopOrderEventsListener
 * already consumes (a separate, independent listener — per this module's own
 * rule in commerce-events.ts, modules must not call each other directly).
 * ORDER_CREATED → InitiateCheckout, PAYMENT_SUCCEEDED → Purchase.
 */
@Injectable()
export class MetaCapiOrderListener {
  private readonly logger = new Logger(MetaCapiOrderListener.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,
    private readonly metaCapi: MetaCapiService,
    private readonly behaviorTracking: BehaviorTrackingService,
    private readonly geoIp: GeoIpService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.ORDER_CREATED)
  async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
    try {
      const order = await this.orderRepo.findOneBy({ id: event.orderId });
      if (!order) return;

      const items = await this.itemRepo.findBy({ orderId: event.orderId });

      await this.metaCapi.sendEvent({
        eventName: 'InitiateCheckout',
        // Same value the browser-side InitiateCheckout event uses as its
        // eventID — matches Meta's dedup on (event_name, event_id).
        eventId: order.orderNumber,
        eventSourceUrl: `${process.env.APP_URL ?? ''}/${order.customerLocale ?? 'fr'}/shop/checkout`,
        customData: {
          value: order.totalCents / 100,
          currency: 'EUR',
          content_type: 'product',
          content_ids: items.map((i) => i.variantId ?? i.productId ?? i.id),
          num_items: items.reduce((n, i) => n + i.quantity, 0),
        },
        email: order.customerEmail,
        clientIpAddress: order.clientIpAddress,
        clientUserAgent: order.clientUserAgent,
        fbc: order.metaClickId,
        fbp: order.metaBrowserId,
      });

      // ORDER_CREATED fires when the customer submits the address form, which is
      // exactly the moment they land on the shipping step — one step before they
      // click through to payment. Recorded once per distinct product in the
      // order so the step can be attributed per product: the product-scoped
      // funnel and the test-product demand report both filter on `productId`,
      // and a single cart-level row with a NULL productId is invisible to them.
      // Both reports count DISTINCT cartToken, so the extra rows per order do
      // not inflate the step.
      const startedProductIds = [
        ...new Set(items.map((i) => i.productId).filter((id): id is string => !!id)),
      ];
      const startedBase = {
        cartToken: order.cartToken,
        shopCustomerId: order.customerId,
        countryCode: this.geoIp.countryFromIp(order.clientIpAddress),
        visitorHash: this.geoIp.visitorHashFromIp(order.clientIpAddress),
        clientIp: order.clientIpAddress,
        device: deviceFromUserAgent(order.clientUserAgent),
      };
      if (startedProductIds.length) {
        for (const productId of startedProductIds) {
          await this.behaviorTracking.record('checkout_started', {
            ...startedBase,
            productId,
          });
        }
      } else {
        await this.behaviorTracking.record('checkout_started', startedBase);
      }
      // Retroactively attribute this guest's pre-checkout browsing/search/cart
      // activity (logged under cartToken only) to the customer record now that
      // it's known.
      if (order.cartToken && order.customerId) {
        await this.behaviorTracking.backfillCustomerId(
          order.cartToken,
          order.customerId,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to send Meta CAPI InitiateCheckout event for ${event.orderId}: ${(err as Error).message}`,
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

      await this.metaCapi.sendEvent({
        eventName: 'Purchase',
        // Same value the browser-side Purchase event uses as its eventID.
        eventId: order.orderNumber,
        eventSourceUrl: `${process.env.APP_URL ?? ''}/${order.customerLocale ?? 'fr'}/shop/checkout/success?order=${order.orderNumber}`,
        customData: {
          value: order.totalCents / 100,
          currency: 'EUR',
          content_type: 'product',
          content_ids: items.map((i) => i.variantId ?? i.productId ?? i.id),
          contents: items.map((i) => ({
            id: i.variantId ?? i.productId ?? i.id,
            quantity: i.quantity,
            item_price: i.unitPriceCents / 100,
          })),
        },
        email: order.customerEmail,
        clientIpAddress: order.clientIpAddress,
        clientUserAgent: order.clientUserAgent,
        fbc: order.metaClickId,
        fbp: order.metaBrowserId,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send Meta CAPI purchase event for ${event.orderId}: ${(err as Error).message}`,
      );
    }
  }
}
