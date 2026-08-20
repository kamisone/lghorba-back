import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, In, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { z } from 'zod';

import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cart-item.entity';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import { OrderStatusHistory } from '../entities/order-status-history.entity';
import { ShippingMethod } from '../entities/shipping-method.entity';
import { ShopPromotion } from '../entities/shop-promotion.entity';
import { ProductVariant } from '../entities/product-variant.entity';
import { Product } from '../entities/product.entity';
import { InventoryService } from '../inventory/inventory.service';
import { FREE_SHIPPING_METHOD_ID, ShippingService, ZoneInfo } from '../shipping/shipping.service';
import { CustomerService } from '../customer/customer.service';
import { CommerceEventBus } from '../events/commerce-event-bus.service';
import { PricingEngineService, LineItemInput, PricingResult } from '../pricing/pricing-engine.service';
import { resolveUnitPriceForQuantity, sumOptionAdjustments } from '../pricing/variant-price';
import { containsTestProduct } from '../shared/test-product';
import { TestCheckoutGuard } from '../shared/test-checkout-guard.service';
import { COMMERCE_EVENTS } from '../events/commerce-events';
import {
  CHECKOUT_RESERVATION_QUEUE,
  RESERVATION_TTL_MS,
  ReservationExpiryJobData,
} from './checkout-reservation.constants';

// ── Input schemas ─────────────────────────────────────────────────────────────

export const InitiateCheckoutSchema = z.object({
  cartToken:    z.string().uuid(),
  email:        z.string().email().max(300),
  firstName:    z.string().max(150).nullish(),
  lastName:     z.string().max(150).nullish(),
  companyName:  z.string().max(200).nullish(),
  phone:        z.string().max(50).nullish(),
  line1:        z.string().min(1).max(500),
  line2:        z.string().max(500).nullish(),
  city:         z.string().min(1).max(200),
  zip:          z.string().min(1).max(20),
  country:      z.string().length(2),
  couponCode:   z.string().max(100).nullish(),
  /**
   * Customer's UI locale. The storefront supports more locales than
   * transactional email templates do (`front/src/lib/i18n/index.ts` LOCALES
   * vs `Lang = 'fr' | 'en'` in email/templates/copy.ts) — accept whatever
   * the frontend sends rather than hard-rejecting it, since `resolveLang`
   * already falls back to 'fr' for anything it doesn't recognize. A strict
   * fr/en-only enum here previously turned checkout submission into an
   * uncaught 500 for any customer on es/it/de/nl/pl.
   */
  locale:       z.string().max(10).optional().default('fr'),
  /** Meta Click ID / Browser ID cookies (_fbc / _fbp), read client-side — for Conversions API match quality only. */
  fbc:          z.string().max(500).nullish(),
  fbp:          z.string().max(500).nullish(),
  /** TikTok Click ID / Browser ID (ttclid / _ttp), read client-side — for Events API match quality only. */
  ttclid:       z.string().max(500).nullish(),
  ttp:          z.string().max(500).nullish(),
}).superRefine((d, ctx) => {
  const hasName    = d.firstName?.trim() && d.lastName?.trim();
  const hasCompany = d.companyName?.trim();
  if (!hasName && !hasCompany) {
    ctx.addIssue({ code: 'custom', path: ['firstName'], message: 'Provide first & last name or a company name' });
  }
});
export type InitiateCheckoutDto = z.infer<typeof InitiateCheckoutSchema>;

export const UpdateShippingSchema = z.object({
  shippingMethodId: z.string().uuid(),
});
export type UpdateShippingDto = z.infer<typeof UpdateShippingSchema>;

/** Free-shipping configuration read from a product for the pricing engine. */
interface FreeShippingProductInfo {
  methodIds: string[];
  daysMin: number | null;
  daysMax: number | null;
}

// ── Response ──────────────────────────────────────────────────────────────────

export interface CheckoutSnapshot {
  orderId:              string;
  orderNumber:          string;
  status:               string;
  subtotalCents:        number;
  shippingCents:        number;
  categoryDiscountCents: number;
  discountCents:        number;
  totalCents:           number;
  couponCode:           string | null;
  shippingMethodId:     string | null;
  shippingMethods: Array<{
    id:               string;
    name:             string;
    priceCents:       number;
    /** What the method would have cost — lets the UI strike it through. */
    originalPriceCents?: number;
    isFree?:          boolean;
    /** The paid faster option offered alongside free shipping. */
    isFreeShippingUpgrade?: boolean;
    estimatedDaysMin: number;
    estimatedDaysMax: number;
  }>;
  /** Order ships free, and why — so the storefront can name the reason. */
  freeShipping:         boolean;
  freeShippingReason:   'product' | 'promotion' | 'coupon' | null;
  /** The paid faster options offered next to free shipping, narrowed to the zone. */
  freeShippingUpgradeMethodIds: string[];
  zoneInfo:             ZoneInfo | null;
  reservationExpiresAt: string | null;
  trackingToken:        string | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    @InjectRepository(Cart)                private readonly cartRepo:    Repository<Cart>,
    @InjectRepository(Order)               private readonly orderRepo:   Repository<Order>,
    @InjectRepository(OrderItem)           private readonly itemRepo:    Repository<OrderItem>,
    @InjectRepository(OrderStatusHistory)  private readonly historyRepo: Repository<OrderStatusHistory>,
    @InjectRepository(ShopPromotion)       private readonly promoRepo:   Repository<ShopPromotion>,
    @InjectRepository(ProductVariant)      private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(Product)             private readonly productRepo: Repository<Product>,
    @InjectQueue(CHECKOUT_RESERVATION_QUEUE) private readonly reservationQueue: Queue,
    private readonly dataSource:       DataSource,
    private readonly inventoryService: InventoryService,
    private readonly shippingService:  ShippingService,
    private readonly customerService:  CustomerService,
    private readonly eventBus:         CommerceEventBus,
    private readonly pricingEngine:    PricingEngineService,
    private readonly testCheckoutGuard: TestCheckoutGuard,
  ) {}

  // ── Initiate checkout ──────────────────────────────────────────────────────
  // Creates a draft order with server-computed totals and inventory reservation.
  // Idempotent: returns existing draft order if same cart token already has one.

  async initiate(
    dto: InitiateCheckoutDto,
    requestMeta?: { ip: string | null; userAgent: string | null },
  ): Promise<CheckoutSnapshot> {
    const cart = await this.cartRepo.findOne({
      where: { token: dto.cartToken, status: 'active' },
      relations: ['items'],
    });
    if (!cart) throw new NotFoundException('Active cart not found');
    if (!cart.items.length) throw new BadRequestException('Cart is empty');

    // Idempotency: return existing draft/in-progress order for this cart token.
    // The cart stays "active" (and its items visible) until the payment webhook
    // confirms success, so a page refresh during checkout must resume this order
    // rather than creating a duplicate (and double-reserving inventory).
    const existing = await this.orderRepo.findOneBy({ cartToken: dto.cartToken, status: In(['draft', 'awaiting_payment']) });
    if (existing) {
      const items = cart.items as CartItem[];
      const productIds = [...new Set(items.map(i => i.productId))];
      const categoryMap = await this.loadProductCategoryIds(productIds);
      const freeShipMap = await this.loadFreeShippingProducts(productIds);
      const lineInputs: LineItemInput[] = items.map(item => ({
        variantId:      item.variantId,
        productId:      item.productId,
        categoryIds:    categoryMap.get(item.productId) ?? [],
        quantity:       item.quantity,
        unitPriceCents: item.unitPriceCents,
        freeShipping:   freeShipMap.has(item.productId),
        freeShippingUpgradeMethodIds: freeShipMap.get(item.productId)?.methodIds ?? [],
        freeShippingDaysMin: freeShipMap.get(item.productId)?.daysMin ?? null,
        freeShippingDaysMax: freeShipMap.get(item.productId)?.daysMax ?? null,
      }));
      const pricing = await this.pricingEngine.compute(lineInputs, dto.couponCode ?? null);

      existing.customerEmail       = dto.email;
      existing.customerName        = `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim() || dto.companyName?.trim() || null;
      existing.customerCompanyName = dto.companyName?.trim() || null;
      existing.customerPhone       = dto.phone ?? null;
      existing.customerLocale      = dto.locale ?? 'fr';
      existing.clientIpAddress    = requestMeta?.ip ?? existing.clientIpAddress;
      existing.clientUserAgent    = requestMeta?.userAgent ?? existing.clientUserAgent;
      existing.metaClickId        = dto.fbc ?? existing.metaClickId;
      existing.metaBrowserId      = dto.fbp ?? existing.metaBrowserId;
      existing.tiktokClickId      = dto.ttclid ?? existing.tiktokClickId;
      existing.tiktokBrowserId    = dto.ttp ?? existing.tiktokBrowserId;
      existing.shippingAddressSnapshot = {
        name:    `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim() || dto.companyName?.trim() || '',
        line1:   dto.line1,
        line2:   dto.line2 ?? '',
        city:    dto.city,
        zip:     dto.zip,
        country: dto.country,
      };
      existing.subtotalCents         = pricing.rawSubtotalCents;
      existing.categoryDiscountCents = pricing.categoryDiscountCents;
      existing.discountCents         = pricing.couponDiscountCents;
      existing.totalCents            = pricing.afterCategorySubtotalCents - pricing.couponDiscountCents + existing.shippingCents;
      existing.couponCode            = pricing.couponCode;
      existing.pricingSnapshot       = pricing as unknown as Record<string, unknown>;
      // Re-evaluate: a product may have been flagged as a test after this order
      // was created, and this branch is how a mid-checkout refresh resumes.
      existing.isTestOrder           = await containsTestProduct(this.productRepo, productIds);
      await this.orderRepo.save(existing);

      const { zone, methods } = await this.shippingService.getMethodsForCountry(
        dto.country, existing.subtotalCents, undefined,
        { forceFree: pricing.freeShipping, upgradeMethodIds: pricing.freeShippingUpgradeMethodIds,
        freeDaysMin: pricing.freeShippingDaysMin,
        freeDaysMax: pricing.freeShippingDaysMax },
      );
      return this.toSnapshot(existing, methods, zone);
    }

    const items = cart.items as CartItem[];

    // ── Re-verify cart item prices against current product/variant data ────
    await this.verifyCartItemPrices(items);

    // Load product category IDs for pricing engine
    const productIds = [...new Set(items.map(i => i.productId))];
    const categoryMap = await this.loadProductCategoryIds(productIds);
    const freeShipMap = await this.loadFreeShippingProducts(productIds);
    const isTestOrder = await containsTestProduct(this.productRepo, productIds);

    // Build line inputs with freshly verified prices
    const lineInputs: LineItemInput[] = items.map(item => ({
      variantId:      item.variantId,
      productId:      item.productId,
      categoryIds:    categoryMap.get(item.productId) ?? [],
      quantity:       item.quantity,
      unitPriceCents: item.unitPriceCents,
      freeShipping:   freeShipMap.has(item.productId),
        freeShippingUpgradeMethodIds: freeShipMap.get(item.productId)?.methodIds ?? [],
        freeShippingDaysMin: freeShipMap.get(item.productId)?.daysMin ?? null,
        freeShippingDaysMax: freeShipMap.get(item.productId)?.daysMax ?? null,
    }));

    const pricing = await this.pricingEngine.compute(lineInputs, dto.couponCode ?? null);

    const snapshot = await this.dataSource.transaction(async (em) => {
      const seq = await em.query(`SELECT nextval('shop_order_number_seq') AS n`);
      const orderNumber = `ORD-${String(seq[0].n).padStart(6, '0')}`;
      const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

      const order = await em.save(Order, em.create(Order, {
        orderNumber,
        status:               'draft',
        isTestOrder,
        cartToken:            dto.cartToken,
        customerEmail:        dto.email,
        customerName:         `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim() || dto.companyName?.trim() || null,
        customerCompanyName:  dto.companyName?.trim() || null,
        customerPhone:        dto.phone ?? null,
        customerLocale:       dto.locale ?? 'fr',
        clientIpAddress:      requestMeta?.ip ?? null,
        clientUserAgent:      requestMeta?.userAgent ?? null,
        metaClickId:          dto.fbc ?? null,
        metaBrowserId:        dto.fbp ?? null,
        tiktokClickId:        dto.ttclid ?? null,
        tiktokBrowserId:      dto.ttp ?? null,
        shippingAddressSnapshot: {
          name:    `${dto.firstName ?? ''} ${dto.lastName ?? ''}`.trim() || dto.companyName?.trim() || '',
          line1:   dto.line1,
          line2:   dto.line2 ?? '',
          city:    dto.city,
          zip:     dto.zip,
          country: dto.country,
        },
        subtotalCents:          pricing.rawSubtotalCents,
        shippingCents:          0,
        categoryDiscountCents:  pricing.categoryDiscountCents,
        discountCents:          pricing.couponDiscountCents,
        taxCents:               0,
        totalCents:             pricing.afterCategorySubtotalCents - pricing.couponDiscountCents,
        couponCode:             pricing.couponCode,
        trackingToken:           randomUUID(),
        shippingMethodId:       null,
        pricingSnapshot:        pricing as unknown as Record<string, unknown>,
        reservationExpiresAt:   expiresAt,
      }));

      // Reserve inventory with real orderId
      for (const item of items) {
        await this.inventoryService.reserveForOrder(item.variantId, item.quantity, order.id, em);
      }

      // Snapshot order items
      for (const item of items) {
        await em.save(OrderItem, em.create(OrderItem, {
          orderId:          order.id,
          productId:        item.productId,
          variantId:        item.variantId,
          titleSnapshot:    item.titleSnapshot,
          skuSnapshot:      item.skuSnapshot,
          imageKeySnapshot: item.imageKeySnapshot,
          quantity:         item.quantity,
          unitPriceCents:   item.unitPriceCents,
          totalCents:       item.unitPriceCents * item.quantity,
        }));
      }

      await em.save(OrderStatusHistory, em.create(OrderStatusHistory, {
        orderId:    order.id,
        fromStatus: null,
        toStatus:   'draft',
        note:       'Checkout initiated',
      }));

      return order;
    });

    await this.reservationQueue.add(
      'expire-reservation',
      { orderId: snapshot.id } satisfies ReservationExpiryJobData,
      { jobId: `expire-${snapshot.id}`, delay: RESERVATION_TTL_MS, attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    this.eventBus.emit(
      COMMERCE_EVENTS.ORDER_CREATED,
      { orderId: snapshot.id, orderNumber: snapshot.orderNumber },
      { entityId: snapshot.id, source: 'CheckoutService.initiate' },
    );

    const { zone: shippingZone, methods: shippingMethods } = await this.shippingService.getMethodsForCountry(
      dto.country, snapshot.subtotalCents, undefined,
      { forceFree: pricing.freeShipping, upgradeMethodIds: pricing.freeShippingUpgradeMethodIds,
        freeDaysMin: pricing.freeShippingDaysMin,
        freeDaysMax: pricing.freeShippingDaysMax },
    );
    return this.toSnapshot(snapshot, shippingMethods, shippingZone);
  }

  // ── Update shipping selection ──────────────────────────────────────────────

  async updateShipping(orderId: string, dto: UpdateShippingDto): Promise<CheckoutSnapshot> {
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) throw new NotFoundException('Order not found');
    // `awaiting_payment` is still editable: the customer may step back from the
    // payment screen to change carrier, and until the webhook confirms payment
    // nothing is final. This used to no-op for that status, which silently threw
    // the new selection away. The PaymentIntent is not "locked in" either —
    // `createPaymentIntent` re-syncs its amount, and is called on every path that
    // returns to payment.
    if (order.status !== 'draft' && order.status !== 'awaiting_payment') {
      throw new BadRequestException('Order is no longer modifiable');
    }

    const country = (order.shippingAddressSnapshot as any)?.country ?? 'XX';
    const { zone, methods } = await this.shippingService.getMethodsForCountry(
      country, order.subtotalCents, undefined,
      { forceFree: this.orderShipsFree(order), upgradeMethodIds: this.orderUpgradeMethodIds(order),
      freeDaysMin: this.orderPricing(order)?.freeShippingDaysMin ?? null,
      freeDaysMax: this.orderPricing(order)?.freeShippingDaysMax ?? null },
    );
    const method = methods.find(m => m.id === dto.shippingMethodId);
    if (!method) throw new BadRequestException('Shipping method not available for this order');

    // The quote already applied free shipping (0 for the free option, real
    // price for the paid upgrade), so trust it. Overriding to 0 here would make
    // the upgrade impossible to actually buy.
    const shippingCents = method.priceCents;

    // The free option is synthetic — there is no such row in
    // shop_shipping_methods, so it is stored as NULL (the column is nullable).
    // `toSnapshot` maps it back to the sentinel so the UI can keep it selected.
    order.shippingMethodId = method.id === FREE_SHIPPING_METHOD_ID ? null : method.id;
    order.shippingCents   = shippingCents;
    order.totalCents      = order.subtotalCents
      - order.categoryDiscountCents
      - order.discountCents
      + shippingCents;
    await this.orderRepo.save(order);

    return this.toSnapshot(order, methods, zone);
  }

  // ── Transition draft → awaiting_payment ───────────────────────────────────

  async readyForPayment(orderId: string): Promise<{ orderId: string; orderNumber: string; totalCents: number }> {
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) throw new NotFoundException('Order not found');

    // Test products are refused here — before the status transition, before
    // coupon usage is incremented, and before any Stripe call. The customer sees
    // a generic failure on the shipping step and the payment form never loads.
    await this.testCheckoutGuard.assertCheckoutAllowed(order);

    // Idempotent resume: a page refresh re-runs the checkout flow against the
    // same draft/awaiting_payment order (see initiate()'s idempotency check).
    if (order.status === 'awaiting_payment') {
      return { orderId: order.id, orderNumber: order.orderNumber, totalCents: order.totalCents };
    }
    if (order.status !== 'draft') throw new BadRequestException('Order is not in draft state');
    // A free-shipping order legitimately has no method row: free delivery is the
    // default and is stored as NULL. Only a payable order must name a carrier.
    if (!order.shippingMethodId && !this.orderShipsFree(order)) {
      throw new BadRequestException('Please select a shipping method before payment');
    }

    order.status = 'awaiting_payment';
    await this.orderRepo.save(order);

    await this.historyRepo.save(this.historyRepo.create({
      orderId,
      fromStatus: 'draft',
      toStatus:   'awaiting_payment',
      note:       'Customer proceeded to payment',
    }));

    // Atomically increment coupon usage with concurrent-safe guard
    if (order.couponCode) {
      const result = await this.promoRepo
        .createQueryBuilder()
        .update()
        .set({ usesCount: () => '"usesCount" + 1' })
        .where(
          'code = :code AND ("maxUsesTotal" IS NULL OR "usesCount" < "maxUsesTotal")',
          { code: order.couponCode },
        )
        .execute();
      if ((result.affected ?? 0) === 0) {
        throw new BadRequestException('Coupon usage limit has been reached. Please remove the coupon and try again.');
      }
    }

    // NOTE: the cart is intentionally left "active" here — it's only marked
    // "completed" once the Stripe webhook confirms payment (OrdersService.confirmPayment).
    // This keeps the customer's cart items intact if payment fails, is abandoned,
    // or the page is refreshed mid-payment.

    await this.customerService.upsertFromOrder(
      order.customerEmail,
      order.customerName ?? null,
      order.customerPhone ?? null,
      order.userId ?? null,
    );

    return { orderId: order.id, orderNumber: order.orderNumber, totalCents: order.totalCents };
  }

  // ── Get snapshot for existing order ───────────────────────────────────────

  async getSnapshot(orderId: string): Promise<CheckoutSnapshot> {
    const order = await this.orderRepo.findOneBy({ id: orderId });
    if (!order) throw new NotFoundException('Order not found');
    const country = (order.shippingAddressSnapshot as any)?.country ?? 'XX';
    if (order.status === 'draft') {
      const { zone, methods } = await this.shippingService.getMethodsForCountry(
      country, order.subtotalCents, undefined,
      { forceFree: this.orderShipsFree(order), upgradeMethodIds: this.orderUpgradeMethodIds(order),
      freeDaysMin: this.orderPricing(order)?.freeShippingDaysMin ?? null,
      freeDaysMax: this.orderPricing(order)?.freeShippingDaysMax ?? null },
    );
      return this.toSnapshot(order, methods, zone);
    }
    return this.toSnapshot(order, [], null);
  }

  // ── Validate coupon (public endpoint, no side effects) ────────────────────

  async validateCouponForCart(
    couponCode: string,
    cartToken: string,
  ): Promise<{ valid: boolean; discountCents: number; freeShipping: boolean; message?: string }> {
    const cart = await this.cartRepo.findOne({
      where: { token: cartToken, status: 'active' },
      relations: ['items'],
    });
    if (!cart || !cart.items.length) {
      return { valid: false, discountCents: 0, freeShipping: false, message: 'Cart not found' };
    }

    const items = cart.items as CartItem[];
    const productIds = [...new Set(items.map(i => i.productId))];
    const categoryMap = await this.loadProductCategoryIds(productIds);
    const freeShipMap = await this.loadFreeShippingProducts(productIds);

    const lineInputs: LineItemInput[] = items.map(item => ({
      variantId:      item.variantId,
      productId:      item.productId,
      categoryIds:    categoryMap.get(item.productId) ?? [],
      quantity:       item.quantity,
      unitPriceCents: item.unitPriceCents,
      freeShipping:   freeShipMap.has(item.productId),
        freeShippingUpgradeMethodIds: freeShipMap.get(item.productId)?.methodIds ?? [],
        freeShippingDaysMin: freeShipMap.get(item.productId)?.daysMin ?? null,
        freeShippingDaysMax: freeShipMap.get(item.productId)?.daysMax ?? null,
    }));

    const pricing = await this.pricingEngine.compute(lineInputs, couponCode);

    if (!pricing.couponCode) {
      return { valid: false, discountCents: 0, freeShipping: false, message: 'Coupon is not valid or not applicable to this cart' };
    }

    return {
      valid: true,
      discountCents: pricing.couponDiscountCents,
      freeShipping:  pricing.freeShipping,
    };
  }

  // ── Price verification ─────────────────────────────────────────────────────

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

      // Quantity-aware: an upselling product's line must re-verify at the
      // tier price for item.quantity, not the flat variant/option price —
      // otherwise checkout would reject every upsell-priced cart with a
      // false PRICE_CHANGED.
      const currentPrice = resolveUnitPriceForQuantity(
        {
          variantPriceCents:     variant.priceCents,
          basePriceCents:        product.basePriceCents ?? null,
          optionAdjustmentCents: sumOptionAdjustments(variant.options ?? []),
        },
        item.quantity,
        { upsellingEnabled: product.upsellingEnabled, upsellTiers: product.upsellTiers },
      );

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

  // ── Helpers ────────────────────────────────────────────────────────────────

  private async loadProductCategoryIds(productIds: string[]): Promise<Map<string, string[]>> {
    if (!productIds.length) return new Map();

    const rows = await this.dataSource.query<{ productId: string; categoryId: string }[]>(`
      SELECT DISTINCT p."id" AS "productId", p."primaryCategoryId" AS "categoryId"
      FROM shop_products p
      WHERE p."id" = ANY($1) AND p."primaryCategoryId" IS NOT NULL
      UNION
      SELECT m."productId", m."categoryId"
      FROM shop_product_category_map m
      WHERE m."productId" = ANY($1)
    `, [productIds]);

    const map = new Map<string, string[]>();
    for (const row of rows) {
      if (!map.has(row.productId)) map.set(row.productId, []);
      map.get(row.productId)!.push(row.categoryId);
    }
    return map;
  }

  /**
   * Whether the order already qualifies for free shipping, from whichever source
   * the pricing engine resolved. Quotes are forced to 0 with this so the methods
   * the customer picks from never advertise a price that will not be charged.
   */
  private orderShipsFree(order: Order): boolean {
    return (
      (order.pricingSnapshot as (PricingResult & Record<string, unknown>) | null)
        ?.freeShipping === true
    );
  }

  /**
   * Free-shipping products in the basket, with the paid upgrade each one offers.
   * A single query — the pricing engine needs both to decide whether the order
   * ships free and what faster option to put next to it.
   */
  private async loadFreeShippingProducts(
    productIds: string[],
  ): Promise<Map<string, FreeShippingProductInfo>> {
    if (!productIds.length) return new Map();
    const rows = await this.dataSource.query<
      {
        id: string;
        methodIds: string[] | null;
        daysMin: number | null;
        daysMax: number | null;
      }[]
    >(
      `SELECT p."id",
              p."freeShippingDaysMin" AS "daysMin",
              p."freeShippingDaysMax" AS "daysMax",
              COALESCE(
                ARRAY_AGG(m."shippingMethodId") FILTER (WHERE m."shippingMethodId" IS NOT NULL),
                '{}'
              ) AS "methodIds"
       FROM shop_products p
       LEFT JOIN shop_product_free_shipping_methods m ON m."productId" = p."id"
       WHERE p."id" = ANY($1) AND p."freeShipping" = true
       GROUP BY p."id"`,
      [productIds],
    );
    return new Map(
      rows.map((r) => [
        r.id,
        {
          methodIds: r.methodIds ?? [],
          daysMin: r.daysMin,
          daysMax: r.daysMax,
        },
      ]),
    );
  }

  /** The pricing snapshot stored on the order, if any. */
  private orderPricing(order: Order): (PricingResult & Record<string, unknown>) | null {
    return (order.pricingSnapshot as (PricingResult & Record<string, unknown>) | null) ?? null;
  }

  /** The upgrades recorded on the order's pricing snapshot. */
  private orderUpgradeMethodIds(order: Order): string[] {
    return (
      (order.pricingSnapshot as (PricingResult & Record<string, unknown>) | null)
        ?.freeShippingUpgradeMethodIds ?? []
    );
  }

  private toSnapshot(order: Order, shippingMethods: ShippingMethod[], zone: ZoneInfo | null): CheckoutSnapshot {
    const pricing = order.pricingSnapshot as (PricingResult & Record<string, unknown>) | null;
    return {
      orderId:               order.id,
      orderNumber:           order.orderNumber,
      status:                order.status,
      subtotalCents:         order.subtotalCents,
      shippingCents:         order.shippingCents,
      categoryDiscountCents: order.categoryDiscountCents ?? 0,
      discountCents:         order.discountCents,
      totalCents:            order.totalCents,
      couponCode:            order.couponCode,
      shippingMethodId:      order.shippingMethodId
        ?? (pricing?.freeShipping ? FREE_SHIPPING_METHOD_ID : null),
      shippingMethods:       shippingMethods.map(m => ({
        id:               m.id,
        name:             m.name,
        priceCents:       m.priceCents,
        originalPriceCents: (m as ShippingMethod & { originalPriceCents?: number })
          .originalPriceCents ?? m.priceCents,
        isFree:           (m as ShippingMethod & { isFree?: boolean }).isFree ?? m.priceCents === 0,
        isFreeShippingUpgrade:
          (m as ShippingMethod & { isFreeShippingUpgrade?: boolean }).isFreeShippingUpgrade ?? false,
        estimatedDaysMin: m.estimatedDaysMin,
        estimatedDaysMax: m.estimatedDaysMax,
      })),
      freeShipping:         pricing?.freeShipping ?? false,
      freeShippingReason:   pricing?.freeShippingReason ?? null,
      freeShippingUpgradeMethodIds: pricing?.freeShippingUpgradeMethodIds ?? [],
      zoneInfo:             zone,
      reservationExpiresAt: order.reservationExpiresAt?.toISOString() ?? null,
      trackingToken:        order.trackingToken ?? null,
    };
  }
}
