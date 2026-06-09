import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Shipment } from '../entities/shipment.entity';
import { ShopEmailService } from '../email/shop-email.service';
import { DocumentService, DocumentInput } from '../../documents/document.service';
import {
  COMMERCE_EVENTS,
  PaymentSucceededEvent,
  PaymentFailedEvent,
  OrderStatusChangedEvent,
} from '../events/commerce-events';

@Injectable()
export class ShopOrderEventsListener {
  private readonly logger = new Logger(ShopOrderEventsListener.name);

  constructor(
    @InjectRepository(Order)     private readonly orderRepo:    Repository<Order>,
    @InjectRepository(OrderItem) private readonly itemRepo:     Repository<OrderItem>,
    @InjectRepository(Shipment)  private readonly shipmentRepo: Repository<Shipment>,
    private readonly email:           ShopEmailService,
    private readonly documentService: DocumentService,
  ) {}

  // ── Payment succeeded → order confirmation email ──────────────────────────

  @OnEvent(COMMERCE_EVENTS.PAYMENT_SUCCEEDED)
  async onPaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
    try {
      const order = await this.orderRepo.findOneBy({ id: event.orderId });
      if (!order) return;

      const items = await this.itemRepo.findBy({ orderId: event.orderId });

      await this.email.sendOrderConfirmed({
        orderId:       order.id,
        orderNumber:   order.orderNumber,
        customerEmail: order.customerEmail,
        customerName:  order.customerName ?? order.customerEmail,
        totalCents:    order.totalCents,
        items: items.map(i => ({
          title:         i.titleSnapshot,
          quantity:      i.quantity,
          unitPriceCents: i.unitPriceCents,
        })),
      });
    } catch (err) {
      this.logger.error(`Order confirmation email failed for ${event.orderId}: ${(err as Error).message}`);
    }

    // Queue PDF receipt generation via the shared documents pipeline
    this.buildOrderDocumentInput(event.orderId, event.paymentIntentId)
      .then(input => this.documentService.scheduleCreation(input))
      .catch(err => this.logger.error(`Receipt scheduling failed for ${event.orderId}: ${(err as Error).message}`));
  }

  // ── Payment failed → failure email ────────────────────────────────────────

  @OnEvent(COMMERCE_EVENTS.PAYMENT_FAILED)
  async onPaymentFailed(event: PaymentFailedEvent): Promise<void> {
    try {
      const order = await this.orderRepo.findOneBy({ id: event.orderId });
      if (!order) return;

      const frontendUrl = process.env.FRONTEND_URL ?? '';
      await this.email.sendPaymentFailed({
        customerEmail: order.customerEmail,
        customerName:  order.customerName ?? order.customerEmail,
        orderNumber:   order.orderNumber,
        retryUrl:      `${frontendUrl}/shop`,
      });
    } catch (err) {
      this.logger.error(`Payment failed email failed for ${event.orderId}: ${(err as Error).message}`);
    }
  }

  // ── Order status changed → shipping / review request emails ──────────────

  @OnEvent(COMMERCE_EVENTS.ORDER_STATUS_CHANGED)
  async onStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
    if (event.toStatus === 'shipped') {
      await this.sendShippingEmail(event.orderId);
    }
    if (event.toStatus === 'delivered') {
      await this.sendReviewRequests(event.orderId);
    }
  }

  private async sendShippingEmail(orderId: string): Promise<void> {
    try {
      const order    = await this.orderRepo.findOneBy({ id: orderId });
      if (!order) return;
      const shipment = await this.shipmentRepo.findOne({
        where: { orderId },
        order: { createdAt: 'DESC' },
      });

      await this.email.sendOrderShipped({
        orderId:        order.id,
        orderNumber:    order.orderNumber,
        customerEmail:  order.customerEmail,
        customerName:   order.customerName ?? order.customerEmail,
        trackingNumber: shipment?.trackingNumber ?? null,
        carrier:        shipment?.carrier ?? null,
      });
    } catch (err) {
      this.logger.error(`Shipping email failed for ${orderId}: ${(err as Error).message}`);
    }
  }

  private async sendReviewRequests(orderId: string): Promise<void> {
    try {
      const order = await this.orderRepo.findOneBy({ id: orderId });
      if (!order) return;
      const items = await this.itemRepo.findBy({ orderId });
      if (!items.length) return;

      const frontendUrl = process.env.FRONTEND_URL ?? '';
      // Send one review request for the first item (avoid email flooding on large orders)
      const first = items[0];
      await this.email.sendReviewRequest({
        orderId:      order.id,
        orderNumber:  order.orderNumber,
        customerEmail: order.customerEmail,
        customerName:  order.customerName ?? order.customerEmail,
        productId:    first.productId ?? '',
        productTitle: first.titleSnapshot,
        reviewUrl:    `${frontendUrl}/shop`,
      });
    } catch (err) {
      this.logger.error(`Review request email failed for ${orderId}: ${(err as Error).message}`);
    }
  }

  // ── Build DocumentInput for the shared documents pipeline ─────────────────

  private async buildOrderDocumentInput(orderId: string, paymentIntentId: string): Promise<DocumentInput> {
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) throw new Error(`Order ${orderId} not found`);
    const items = await this.itemRepo.findBy({ orderId });

    return {
      entityType:      'shop_order',
      entityId:        orderId,
      documentType:    'receipt',
      paymentIntentId: paymentIntentId ?? null,
      customer: {
        email:  order.customerEmail,
        name:   order.customerName ?? null,
        locale: 'fr',
      },
      seller: {
        name:      process.env.SELLER_NAME            ?? '',
        address: {
          line1:   process.env.SELLER_ADDRESS_LINE1   ?? '',
          city:    process.env.SELLER_ADDRESS_CITY    ?? '',
          zip:     process.env.SELLER_ADDRESS_ZIP     ?? '',
          country: process.env.SELLER_ADDRESS_COUNTRY ?? 'FR',
        },
        vatNumber: process.env.SELLER_VAT_NUMBER ?? null,
        siret:     process.env.SELLER_SIRET      ?? null,
      },
      financial: {
        subtotalCents:  order.subtotalCents,
        deliveryCents:  order.shippingCents,
        discountCents:  order.discountCents,
        taxCents:       order.taxCents,
        totalCents:     order.totalCents,
        couponCode:     order.couponCode ?? null,
      },
      tax:             { ratePct: 20, label: 'TVA 20%', country: 'FR' },
      deliveryAddress: order.shippingAddressSnapshot ?? null,
      lines: items.map((item, i) => ({
        description:    item.titleSnapshot,
        sku:            item.skuSnapshot ?? null,
        quantity:       item.quantity,
        unitPriceCents: item.unitPriceCents,
        totalCents:     item.totalCents,
        sortOrder:      i,
      })),
    };
  }
}
