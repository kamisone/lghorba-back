import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { z } from 'zod';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderStatusHistory } from '../entities/order-status-history.entity';
import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';
import { ShopPromotion } from '../entities/shop-promotion.entity';
import { InventoryService } from '../inventory/inventory.service';
import { CustomerService } from '../customer/customer.service';

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
  discountCents:    z.number().int().min(0).optional(),
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
  constructor(
    @InjectRepository(Order)          private readonly orderRepo:   Repository<Order>,
    @InjectRepository(OrderItem)      private readonly itemRepo:    Repository<OrderItem>,
    @InjectRepository(OrderStatusHistory) private readonly historyRepo: Repository<OrderStatusHistory>,
    @InjectRepository(Cart)           private readonly cartRepo:    Repository<Cart>,
    @InjectRepository(ShopPromotion)  private readonly promoRepo:   Repository<ShopPromotion>,
    private readonly inventoryService: InventoryService,
    private readonly customerService:  CustomerService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Create from cart ────────────────────────────────────────────────────────

  async createFromCart(dto: CreateOrderDto): Promise<Order> {
    const cart = await this.cartRepo.findOne({
      where: { token: dto.cartToken, status: 'active' },
      relations: ['items'],
    });
    if (!cart) throw new NotFoundException('Active cart not found');
    if (!cart.items.length) throw new BadRequestException('Cart is empty');

    return this.dataSource.transaction(async (em) => {
      // Generate order number via sequence
      const seq = await em.query(`SELECT nextval('shop_order_number_seq') AS n`);
      const orderNumber = `ORD-${String(seq[0].n).padStart(6, '0')}`;

      const items = cart.items as CartItem[];
      const subtotalCents = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);
      const shippingCents = dto.shippingCents ?? 0;
      const discountCents = dto.discountCents ?? 0;
      const totalCents    = subtotalCents + shippingCents - discountCents;

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
        discountCents,
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

      // Create order items (immutable snapshots)
      for (const item of items) {
        await em.save(OrderItem, em.create(OrderItem, {
          orderId:        savedOrder.id,
          productId:      item.productId,
          variantId:      item.variantId,
          titleSnapshot:  item.titleSnapshot,
          skuSnapshot:    item.skuSnapshot,
          imageKeySnapshot: item.imageKeySnapshot,
          quantity:       item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents:     item.unitPriceCents * item.quantity,
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

    const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(toStatus)) {
      throw new BadRequestException(`Cannot transition from "${order.status}" to "${toStatus}"`);
    }

    return this.dataSource.transaction(async (em) => {
      const prev = order.status;
      order.status = toStatus;
      await em.save(Order, order);

      await em.save(OrderStatusHistory, em.create(OrderStatusHistory, {
        orderId,
        fromStatus: prev,
        toStatus,
        note:    note ?? null,
        adminId: adminId ?? null,
      }));

      // Release inventory if cancelled
      if (toStatus === 'cancelled') {
        const items = await em.find(OrderItem, { where: { orderId } });
        for (const item of items) {
          if (item.variantId) {
            await this.inventoryService.releaseForOrder(item.variantId, item.quantity, orderId);
          }
        }
      }

      // Confirm sale when shipped
      if (toStatus === 'shipped') {
        const items = await em.find(OrderItem, { where: { orderId } });
        for (const item of items) {
          if (item.variantId) {
            await this.inventoryService.confirmSale(item.variantId, item.quantity, orderId);
          }
        }
        // Update customer stats
        await this.customerService.recordOrderCompletion(order.customerEmail, order.totalCents, em);
      }

      return order;
    });
  }

  // ── Confirm payment (idempotent, called by webhook) ─────────────────────────

  async confirmPayment(orderId: string, paymentIntentId: string): Promise<Order> {
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === 'paid') return order; // idempotent

    order.paymentIntentId = paymentIntentId;
    await this.orderRepo.save(order);

    // Draft orders skipped the awaiting_payment step — transition through it
    if (order.status === 'draft') {
      await this.transition(orderId, 'awaiting_payment', 'Payment initiated');
    }
    return this.transition(orderId, 'paid', 'Payment confirmed via Stripe webhook');
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
}
