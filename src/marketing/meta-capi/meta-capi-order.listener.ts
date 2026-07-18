import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { Order } from '../../commerce/entities/order.entity';
import { OrderItem } from '../../commerce/entities/order-item.entity';
import {
  COMMERCE_EVENTS,
  PaymentSucceededEvent,
} from '../../commerce/events/commerce-events';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service';
import {
  META_CAPI_QUEUE,
  MetaCapiPurchaseJobData,
} from './meta-capi.constants';

/**
 * Meta Conversions API — Purchase only. Reacts to the same PAYMENT_SUCCEEDED
 * event as ShopOrderEventsListener (a separate, independent consumer — per this
 * module's own rule in commerce-events.ts, modules must not call each other
 * directly). Sends value/currency/content identifiers + a hashed email only —
 * never name, phone, address, or any other customer PII. See meta-capi.processor.ts
 * for the actual HTTP call and further compliance notes.
 */
@Injectable()
export class MetaCapiOrderListener {
  private readonly logger = new Logger(MetaCapiOrderListener.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,
    @InjectQueue(META_CAPI_QUEUE) private readonly queue: Queue,
    private readonly settings: PlatformSettingsService,
  ) {}

  @OnEvent(COMMERCE_EVENTS.PAYMENT_SUCCEEDED)
  async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    const { pixelId, enabled } = this.settings.getMetaPixelConfig();
    if (!enabled || !pixelId || !process.env.META_CAPI_ACCESS_TOKEN) return;

    try {
      const order = await this.orderRepo.findOneBy({ id: event.orderId });
      if (!order || !order.customerEmail) return;
      const items = await this.itemRepo.findBy({ orderId: event.orderId });
      if (!items.length) return;

      const jobData: MetaCapiPurchaseJobData = {
        orderId: order.id,
        // Same value the browser-side Purchase event uses as its eventID — this is
        // exactly what Meta's dedup matches on (event_name + event_id pair).
        eventId: order.orderNumber,
        eventTime: Math.floor(Date.now() / 1000),
        valueEur: order.totalCents / 100,
        contentIds: items.map((i) => i.variantId ?? i.productId ?? i.id),
        contents: items.map((i) => ({
          id: i.variantId ?? i.productId ?? i.id,
          quantity: i.quantity,
          item_price: i.unitPriceCents / 100,
        })),
        customerEmailHash: createHash('sha256')
          .update(order.customerEmail.trim().toLowerCase())
          .digest('hex'),
        eventSourceUrl: `${process.env.APP_URL ?? ''}/${order.customerLocale ?? 'fr'}/shop/checkout/success?order=${order.orderNumber}`,
        clientIpAddress: order.clientIpAddress,
        clientUserAgent: order.clientUserAgent,
        fbc: order.metaClickId,
        fbp: order.metaBrowserId,
      };

      await this.queue.add('purchase', jobData, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
    } catch (err) {
      this.logger.error(
        `Failed to enqueue Meta CAPI purchase event for ${event.orderId}: ${(err as Error).message}`,
      );
    }
  }
}
