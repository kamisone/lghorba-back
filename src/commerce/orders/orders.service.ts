import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, In, Repository } from 'typeorm';
import { z } from 'zod';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderStatusHistory } from '../entities/order-status-history.entity';
import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';
import { ShopPromotion } from '../entities/shop-promotion.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { Product } from '../entities/product.entity';
import { InventoryService } from '../inventory/inventory.service';
import { resolveVariantPrice, sumOptionAdjustments } from '../pricing/variant-price';
import { CustomerService } from '../customer/customer.service';
import { CommerceEventBus } from '../events/commerce-event-bus.service';
import { COMMERCE_EVENTS, OrderStatusChangedEvent } from '../events/commerce-events';
import { CHECKOUT_RESERVATION_QUEUE } from '../checkout/checkout-reservation.constants';

// ── State machine ───────────────────────────────────────────────────────────

const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  draft:            ['awaiting_payment', 'cancelled'],
  pending:          ['awaiting_payment', 'cancelled'],
  awaiting_payment: ['paid', 'cancelled'],
  paid:             ['processing', 'cancelled', 'refunded'],
  processing:       ['shipped', 'cancelled', 'refunded'],
  shipped:          ['delivered', 'refunded'],
  delivered:        ['refunded'],
  cancelled:        [],
  refunded:         [],
};

// ── Create order schema ──────────────────────────────────────────────────────

export const CreateOrderSchema = z.object({
  cartToken:        z.string().uuid(),
  customerEmail:    z.string().email().max(300),
  customerName:     z.string().max(300).nullish(),
  customerPhone:    z.string().max(50).nullish(),
  shippingAddress:  z.object({
    name:    z.string().max(300),
    line1:   z.string().max(500),
    line2:   z.string().max(500).nullish(),
    city:    z.string().max(200),
    zip:     z.string().max(20),
    country: z.string().max(10),
  }),
  billingAddress:  z.object({
    name:    z.string().max(300),
    line1:   z.string().max(500),
    line2:   z.string().max(500).nullish(),
    city:    z.string().max(200),
    zip:     z.string().max(20),
    country: z.string().max(10),
  }).nullish(),
  shippingMethodId: z.string().uuid().nullish(),
  shippingCents:    z.number().int().min(0).optional(),
  couponCode:       z.string().max(100).nullish(),
  userId:           z.string().uuid().nullish(),
});

export type CreateOrderDto = z.infer<typeof CreateOrderSchema>;

export interface OrderListFilter {
  status?:   OrderStatus;
  search?:   string;
  limit?:    number;
  offset?:   number;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)              private readonly orderRepo:   Repository<Order>,
    @InjectRepository(OrderItem)          private readonly itemRepo:    Repository<OrderItem>,
    @InjectRepository(OrderStatusHistory) private readonly historyRepo: Repository<OrderStatusHistory>,
    @InjectRepository(Cart)               private readonly cartRepo:    Repository<Cart>,
    @InjectRepository(ShopPromotion)      private readonly promoRepo:   Repository<ShopPromotion>,
    @InjectRepository(ProductVariant)     private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Product)            private readonly productRepo: Repository<Product>,
    @InjectQueue(CHECKOUT_RESERVATION_QUEUE) private readonly reservationQueue: Queue,
    private readonly inventoryService: InventoryService,
    private readonly customerService:  CustomerService,
    private readonly eventBus:         CommerceEventBus,
    private readonly dataSource:       DataSource,
  ) {}

  // ── Create from cart ────────────────────────────────────────────────────────

  async createFromCart(dto: CreateOrderDto): Promise<Order> {
    const cart = await this.cartRepo.findOne({
      where: { token: dto.cartToken, status: 'active' },
      relations: ['items'],
    });
    if (!cart) throw new NotFoundException('Active cart not found');
    if (!cart.items.length) throw new BadRequestException('Cart is empty');

    const items = cart.items as CartItem[];

    // Re-verify every cart item price against current product/variant data
    await this.verifyCartItemPrices(items);

    return this.dataSource.transaction(async (em) => {
      // Generate order number via sequence
      const seq = await em.query(`SELECT nextval('shop_order_number_seq') AS n`);
      const orderNumber = `ORD-${String(seq[0].n).padStart(6, '0')}`;

      const subtotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
      const shippingCents = dto.shippingCents ?? 0;
      const totalCents    = Math.max(0, subtotalCents + shippingCents);

      const order = em.create(Order, {
        orderNumber,
        status:          'awaiting_payment',
        userId:          dto.userId ?? null,
        customerEmail:   dto.customerEmail,
        customerName:    dto.customerName ?? null,
        customerPhone:   dto.customerPhone ?? null,
        shippingAddressSnapshot: dto.shippingAddress as Record<string, string>,
        billingAddressSnapshot:  dto.billingAddress as Record<string, string> ?? null,
        subtotalCents,
        shippingCents,
        discountCents:   0,
        taxCents:        0,
        totalCents,
        couponCode:      dto.couponCode ?? null,
        shippingMethodId: dto.shippingMethodId ?? null,
      });
      const savedOrder = await em.save(Order, order);

      // Reserve inventory for each item
      for (const item of items) {
        await this.inventoryService.reserveForOrder(item.variantId, item.quantity, savedOrder.id, em);
      }

      // Create order items (immutable snapshots — never depend on mutable variant data)
      for (const item of items) {
        await em.save(OrderItem, em.create(OrderItem, {
          orderId:                     savedOrder.id,
          productId:                   item.productId,
          variantId:                   item.variantId,
          titleSnapshot:               item.titleSnapshot,
          skuSnapshot:                 item.skuSnapshot,
          imageKeySnapshot:            item.imageKeySnapshot,
          optionsSnapshot:             (item as any).optionsSnapshot ?? null,
          compareAtPriceCentsSnapshot: (item as any).compareAtPriceCentsSnapshot ?? null,
          quantity:                    item.quantity,
          unitPriceCents:              item.unitPriceCents,
          totalCents:                  item.unitPriceCents * item.quantity,
        }));
      }

      // Initial status history
      await em.save(OrderStatusHistory, em.create(OrderStatusHistory, {
        orderId:    savedOrder.id,
        fromStatus: null,
        toStatus:   'awaiting_payment',
        note:       'Order created',
      }));

      // Increment coupon usage
      if (dto.couponCode) {
        await em.getRepository(ShopPromotion)
          .createQueryBuilder()
          .update()
          .set({ usesCount: () => '"usesCount" + 1' })
          .where('code = :code', { code: dto.couponCode })
          .execute();
      }

      // Mark cart completed
      await em.getRepository(Cart).update({ id: cart.id }, { status: 'completed' });

      // Upsert customer record
      await this.customerService.upsertFromOrder(
        dto.customerEmail,
        dto.customerName ?? null,
        dto.customerPhone ?? null,
        dto.userId ?? null,
        em,
      );

      return savedOrder;
    });
  }

  // ── Transition status ───────────────────────────────────────────────────────

  async transition(orderId: string, toStatus: OrderStatus, note?: string, adminId?: string): Promise<Order> {
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) throw new NotFoundException('Order not found');

    const prev = order.status;
    const allowed = ALLOWED_TRANSITIONS[prev] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(`Cannot transition from "${prev}" to "${toStatus}"`);
    }

    const result = await this.dataSource.transaction(async (em) => {
      order.status = toStatus;
      await em.save(Order, order);

      await em.save(OrderStatusHistory, em.create(OrderStatusHistory, {
        orderId,
        fromStatus: prev,
        toStatus,
        note:    note ?? null,
        adminId: adminId ?? null,
      }));

      // Release inventory on cancel/refund — bucket depends on where the stock was held.
      if (toStatus === 'cancelled' || toStatus === 'refunded') {
        const items = await em.find(OrderItem, { where: { orderId } });
        for (const item of items) {
          if (!item.variantId) continue;
          if (prev === 'paid' || prev === 'processing') {
            // Already moved from Reserved -> Committed on payment; release back to Available.
            await this.inventoryService.releaseCommittedForOrder(item.variantId, item.quantity, orderId);
          } else if (prev !== 'shipped' && prev !== 'delivered') {
            // Still in the unpaid Reserved bucket (draft/pending/awaiting_payment).
            await this.inventoryService.releaseForOrder(item.variantId, item.quantity, orderId);
          }
          // shipped/delivered -> refunded: stock was already confirmed sold; no automatic restock.
        }
      }

      // Move Reserved -> Committed once payment is confirmed
      if (toStatus === 'paid') {
        const items = await em.find(OrderItem, { where: { orderId } });
        for (const item of items) {
          if (item.variantId) {
            await this.inventoryService.commitForOrder(item.variantId, item.quantity, orderId);
          }
        }
      }

      // Confirm sale (Committed -> sold) when shipped
      if (toStatus === 'shipped') {
        const items = await em.find(OrderItem, { where: { orderId } });
        for (const item of items) {
          if (item.variantId) {
            await this.inventoryService.confirmSale(item.variantId, item.quantity, orderId);
          }
        }
      }

      // Update customer lifetime stats when payment is confirmed (revenue is realized)
      if (toStatus === 'paid') {
        await this.customerService.recordOrderCompletion(order.customerEmail, order.totalCents, em);
      }

      return order;
    });

    this.eventBus.emit(
      COMMERCE_EVENTS.ORDER_STATUS_CHANGED,
      { orderId, fromStatus: prev, toStatus, triggeredBy: adminId ? 'admin' : 'system' } satisfies OrderStatusChangedEvent,
      { entityId: orderId, source: 'OrdersService.transition' },
    );

    return result;
  }

  // ── Confirm payment (idempotent, called by webhook) ─────────────────────────

  async confirmPayment(orderId: string, paymentIntentId: string): Promise<Order> {
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'paid') return order; // idempotent

    order.paymentIntentId = paymentIntentId;
    await this.orderRepo.save(order);

    // Cancel the pending reservation-expiry job — order is paid, no need to expire it.
    this.reservationQueue.remove(`expire-${orderId}`).catch((err) =>
      this.logger.debug(`Could not remove expiry job for ${orderId}: ${(err as Error).message}`),
    );

    // Draft orders skipped the awaiting_payment step — transition through it.
    if (order.status === 'draft') {
      await this.transition(orderId, 'awaiting_payment', 'Payment initiated');
    }
    const paid = await this.transition(orderId, 'paid', 'Payment confirmed via Stripe webhook');

    // Only now is the cart truly "spent" — mark it completed so a fresh empty
    // cart is created for the customer's next visit, while preserving the
    // (now-paid) order's snapshot of the items.
    if (order.cartToken) {
      await this.cartRepo.update({ token: order.cartToken, status: 'active' }, { status: 'completed' });
    }

    return paid;
  }

  // ── List ────────────────────────────────────────────────────────────────────

  async adminList(filter: OrderListFilter = {}): Promise<{ items: Order[]; total: number }> {
    const { status, search, limit = 20, offset = 0 } = filter;
    const qb = this.orderRepo.createQueryBuilder('o')
      .leftJoinAndSelect('o.items', 'item')
      .orderBy('o.createdAt', 'DESC')
      .take(limit)
      .skip(offset);

    if (status) qb.andWhere('o.status = :status', { status });
    if (search) {
      qb.andWhere(
        '(o.orderNumber ILIKE :q OR o.customerEmail ILIKE :q OR o.customerName ILIKE :q)',
        { q: `%${search}%` },
      );
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async findById(id: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: ['items', 'statusHistory'],
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async findByNumber(orderNumber: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { orderNumber },
      relations: ['items', 'statusHistory'],
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async customerOrders(email: string): Promise<Order[]> {
    return this.orderRepo.find({
      where:   { customerEmail: email },
      order:   { createdAt: 'DESC' },
      relations: ['items'],
    });
  }

  // ── Price verification ──────────────────────────────────────────────────────

  private async verifyCartItemPrices(items: CartItem[]): Promise<void> {
    const variantIds = [...new Set(items.map(i => i.variantId))];
    const productIds = [...new Set(items.map(i => i.productId))];

    const [variants, products] = await Promise.all([
      this.variantRepo.find({
        where: { id: In(variantIds) },
        relations: ['options', 'options.optionValue'],
      }),
      this.productRepo.find({ where: { id: In(productIds) } }),
    ]);

    const variantMap = new Map(variants.map(v => [v.id, v]));
    const productMap = new Map(products.map(p => [p.id, p]));

    for (const item of items) {
      const variant = variantMap.get(item.variantId);
      if (!variant) {
        throw new BadRequestException(
          `Variant "${item.variantId}" no longer exists. Please update your cart.`,
        );
      }

      const product = productMap.get(item.productId);
      if (!product) {
        throw new BadRequestException(
          `Product "${item.productId}" no longer exists. Please update your cart.`,
        );
      }

      if (product.status !== 'active') {
        throw new BadRequestException(
          `Product "${product.title}" is no longer available.`,
        );
      }

      const currentPrice = resolveVariantPrice({
        variantPriceCents:     variant.priceCents,
        basePriceCents:        product.basePriceCents ?? null,
        optionAdjustmentCents: sumOptionAdjustments(variant.options ?? []),
      });

      if (currentPrice !== item.unitPriceCents) {
        throw new BadRequestException({
          code: 'PRICE_CHANGED',
          message: `Price for "${item.titleSnapshot ?? item.variantId}" has changed. Please refresh your cart.`,
          variantId: item.variantId,
          cartPriceCents: item.unitPriceCents,
          currentPriceCents: currentPrice,
        });
      }
    }
  }
}
