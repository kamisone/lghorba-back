import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { Product } from '../entities/product.entity';
import { BehaviorTrackingService } from '../behavior/behavior-tracking.service';
import { GeoIpService } from '../behavior/geo-ip.service';
import { testCheckoutBlockedException } from './test-product';

/**
 * Refuses checkout for orders containing a test product.
 *
 * Called from `CheckoutService.readyForPayment` — the transition triggered when
 * the customer confirms shipping and clicks through to payment. Blocking there
 * means the refusal lands on the shipping step, and crucially happens before the
 * draft → awaiting_payment transition, before coupon usage is incremented, and
 * before any Stripe call: **no PaymentIntent is ever created for a test
 * product**, so no charge is possible by construction rather than by guard.
 *
 * Also called from `ShopPaymentService.createPaymentIntent`, which covers the
 * bare `POST /public/shop/payment/intent` route that skips readyForPayment.
 */
@Injectable()
export class TestCheckoutGuard {
  private readonly logger = new Logger(TestCheckoutGuard.name);

  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
    private readonly behaviorTracking: BehaviorTrackingService,
    private readonly geoIp: GeoIpService,
  ) {}

  /**
   * @throws BadRequestException with a generic failure message when the order
   * contains a test product.
   */
  async assertCheckoutAllowed(order: Order | string): Promise<void> {
    const resolved =
      typeof order === 'string' ? await this.orderRepo.findOneBy({ id: order }) : order;
    if (!resolved) throw new NotFoundException('Order not found');

    // Live product state is the authority, not order.isTestOrder — a product
    // flagged while this customer was mid-checkout must still be caught.
    const testProductIds = await this.findTestProductIds(resolved.id);
    if (!testProductIds.length) return;

    if (!resolved.isTestOrder) {
      await this.orderRepo.update(resolved.id, { isTestOrder: true });
    }
    await this.recordDemandSignal(resolved, testProductIds);

    this.logger.log(
      `Blocked checkout on test order ${resolved.orderNumber} ` +
        `(${resolved.totalCents} cents) — no PaymentIntent created`,
    );
    throw testCheckoutBlockedException(resolved.customerLocale);
  }

  private async findTestProductIds(orderId: string): Promise<string[]> {
    const rows = await this.orderItemRepo
      .createQueryBuilder('i')
      .select('DISTINCT i.productId', 'productId')
      .innerJoin(Product, 'p', 'p.id = i.productId')
      .where('i.orderId = :orderId', { orderId })
      .andWhere('p.isTestProduct = true')
      .getRawMany<{ productId: string }>();
    return rows.map((r) => r.productId);
  }

  /**
   * One event per distinct test product, so demand can be reported per product.
   * Never let an analytics failure change the block outcome.
   */
  private async recordDemandSignal(order: Order, productIds: string[]): Promise<void> {
    try {
      // No request is in scope here (the guard is called from service code), but
      // checkout already captured the client IP on the order, so the demand
      // signal can be geolocated without plumbing the request down.
      const countryCode = this.geoIp.countryFromIp(order.clientIpAddress);
      const visitorHash = this.geoIp.visitorHashFromIp(order.clientIpAddress);
      for (const productId of productIds) {
        await this.behaviorTracking.record('test_checkout_blocked', {
          cartToken: order.cartToken,
          shopCustomerId: order.customerId,
          productId,
          countryCode,
          visitorHash,
        });
      }
    } catch (err) {
      this.logger.error(`Failed to record test-block event for ${order.id}: ${err}`);
    }
  }
}
