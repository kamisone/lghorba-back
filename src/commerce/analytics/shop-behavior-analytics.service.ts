import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { ShopBehaviorEvent } from '../entities/shop-behavior-event.entity';
import { Order } from '../entities/order.entity';
import { Product } from '../entities/product.entity';
import { ShopWishlistItem } from '../entities/shop-wishlist-item.entity';
import { Country } from '../entities/country.entity';

// Same paid-status set already used throughout shop-analytics.service.ts.
const PAID_STATUSES = ['paid', 'processing', 'shipped', 'delivered'];

function pct(numerator: number, denominator: number): number {
  return denominator > 0
    ? Math.round((numerator / denominator) * 1000) / 10
    : 0;
}

export interface TimelineEntry {
  type: string;
  date: Date;
  productId: string | null;
  productTitle: string | null;
  searchQuery: string | null;
  resultCount: number | null;
  quantity: number | null;
  orderId: string | null;
  orderNumber: string | null;
  orderStatus: string | null;
  totalCents: number | null;
}

@Injectable()
export class ShopBehaviorAnalyticsService {
  constructor(
    @InjectRepository(ShopBehaviorEvent)
    private readonly behaviorRepo: Repository<ShopBehaviorEvent>,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ShopWishlistItem)
    private readonly wishlistRepo: Repository<ShopWishlistItem>,
    @InjectRepository(Country)
    private readonly countryRepo: Repository<Country>,
  ) {}

  // ── Conversion funnel ───────────────────────────────────────────────────────

  async getConversionFunnel(days = 30): Promise<{
    days: number;
    views: number;
    addsToCart: number;
    checkoutsStarted: number;
    purchases: number;
    viewToCartRatePct: number;
    cartToCheckoutRatePct: number;
    checkoutToPurchaseRatePct: number;
    overallConversionRatePct: number;
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const counts = await this.behaviorRepo
      .createQueryBuilder('be')
      .select('be.eventType', 'eventType')
      .addSelect('COUNT(be.id)', 'count')
      .where('be.eventType IN (:...types)', {
        types: ['product_view', 'add_to_cart', 'checkout_started'],
      })
      .andWhere('be.createdAt >= :since', { since })
      .groupBy('be.eventType')
      .getRawMany<{ eventType: string; count: string }>();

    const countByType = new Map(
      counts.map((r) => [r.eventType, parseInt(r.count, 10)]),
    );
    const views = countByType.get('product_view') ?? 0;
    const addsToCart = countByType.get('add_to_cart') ?? 0;
    const checkoutsStarted = countByType.get('checkout_started') ?? 0;

    const purchases = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.status IN (:...statuses)', { statuses: PAID_STATUSES })
      .andWhere('o.createdAt >= :since', { since })
      .getCount();

    return {
      days,
      views,
      addsToCart,
      checkoutsStarted,
      purchases,
      viewToCartRatePct: pct(addsToCart, views),
      cartToCheckoutRatePct: pct(checkoutsStarted, addsToCart),
      checkoutToPurchaseRatePct: pct(purchases, checkoutsStarted),
      overallConversionRatePct: pct(purchases, views),
    };
  }

  // ── Test-product demand validation ──────────────────────────────────────────

  /**
   * Per-test-product demand report.
   *
   * `reachedCheckout` is the decision metric: customers who filled in their
   * address, selected shipping and clicked through to payment — the furthest a
   * test product can be taken, and the point at which checkout is refused.
   * These are people who would have bought the product had it been real.
   *
   * Counted by distinct cart rather than raw events, because a customer who
   * retries after the error is one interested buyer, not several.
   *
   * Every test product is listed even with zero activity, so a product that
   * simply is not selling is visible rather than silently absent.
   */
  async getTestProductDemand(days = 30): Promise<
    Array<{
      productId: string;
      title: string;
      slug: string;
      status: string;
      views: number;
      addsToCart: number;
      reachedCheckout: number;
      viewToCartRatePct: number;
      cartToCheckoutRatePct: number;
      viewToCheckoutRatePct: number;
    }>
  > {
    const testProducts = await this.productRepo.find({
      where: { isTestProduct: true },
      select: ['id', 'title', 'slug', 'status'],
    });
    if (!testProducts.length) return [];

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const ids = testProducts.map((p) => p.id);

    const rows = await this.behaviorRepo
      .createQueryBuilder('be')
      .select('be.productId', 'productId')
      .addSelect('be.eventType', 'eventType')
      .addSelect('COUNT(be.id)', 'count')
      .addSelect('COUNT(DISTINCT be.cartToken)', 'distinctCarts')
      .where('be.productId IN (:...ids)', { ids })
      .andWhere('be.eventType IN (:...types)', {
        types: ['product_view', 'add_to_cart', 'test_checkout_blocked'],
      })
      .andWhere('be.createdAt >= :since', { since })
      .groupBy('be.productId')
      .addGroupBy('be.eventType')
      .getRawMany<{
        productId: string;
        eventType: string;
        count: string;
        distinctCarts: string;
      }>();

    const counts = new Map<string, number>();
    const distinct = new Map<string, number>();
    for (const r of rows) {
      counts.set(`${r.productId}:${r.eventType}`, parseInt(r.count, 10));
      distinct.set(`${r.productId}:${r.eventType}`, parseInt(r.distinctCarts, 10));
    }

    return testProducts
      .map((p) => {
        const views = counts.get(`${p.id}:product_view`) ?? 0;
        const addsToCart = counts.get(`${p.id}:add_to_cart`) ?? 0;
        const reachedCheckout = distinct.get(`${p.id}:test_checkout_blocked`) ?? 0;
        return {
          productId: p.id,
          title: p.title,
          slug: p.slug,
          status: p.status as string,
          views,
          addsToCart,
          reachedCheckout,
          viewToCartRatePct: pct(addsToCart, views),
          cartToCheckoutRatePct: pct(reachedCheckout, addsToCart),
          viewToCheckoutRatePct: pct(reachedCheckout, views),
        };
      })
      .sort((a, b) => b.reachedCheckout - a.reachedCheckout || b.views - a.views);
  }

  async getProductConversion(
    days = 30,
    limit = 20,
  ): Promise<
    Array<{
      productId: string;
      title: string;
      slug: string;
      views: number;
      addsToCart: number;
      purchases: number;
      conversionRatePct: number;
    }>
  > {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [viewRows, addRows, purchaseRows] = await Promise.all([
      this.behaviorRepo
        .createQueryBuilder('be')
        .select('be.productId', 'productId')
        .addSelect('COUNT(be.id)', 'count')
        .where(`be.eventType = 'product_view'`)
        .andWhere('be.createdAt >= :since', { since })
        .andWhere('be.productId IS NOT NULL')
        .groupBy('be.productId')
        .getRawMany<{ productId: string; count: string }>(),
      this.behaviorRepo
        .createQueryBuilder('be')
        .select('be.productId', 'productId')
        .addSelect('COUNT(be.id)', 'count')
        .where(`be.eventType = 'add_to_cart'`)
        .andWhere('be.createdAt >= :since', { since })
        .andWhere('be.productId IS NOT NULL')
        .groupBy('be.productId')
        .getRawMany<{ productId: string; count: string }>(),
      this.orderRepo
        .createQueryBuilder('o')
        .innerJoin('shop_order_items', 'i', 'i.orderId = o.id')
        .select('i.productId', 'productId')
        .addSelect('SUM(i.quantity)', 'count')
        .where('o.status IN (:...statuses)', { statuses: PAID_STATUSES })
        .andWhere('o.createdAt >= :since', { since })
        .andWhere('i.productId IS NOT NULL')
        .groupBy('i.productId')
        .getRawMany<{ productId: string; count: string }>(),
    ]);

    const viewMap = new Map(
      viewRows.map((r) => [r.productId, parseInt(r.count, 10)]),
    );
    const addMap = new Map(
      addRows.map((r) => [r.productId, parseInt(r.count, 10)]),
    );
    const purchaseMap = new Map(
      purchaseRows.map((r) => [r.productId, parseInt(r.count, 10)]),
    );

    const productIds = new Set([
      ...viewMap.keys(),
      ...addMap.keys(),
      ...purchaseMap.keys(),
    ]);
    if (productIds.size === 0) return [];

    const products = await this.productRepo.find({
      where: { id: In([...productIds]) },
      select: ['id', 'title', 'slug'],
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const rows = [...productIds].map((productId) => {
      const views = viewMap.get(productId) ?? 0;
      const addsToCart = addMap.get(productId) ?? 0;
      const purchases = purchaseMap.get(productId) ?? 0;
      const product = productMap.get(productId);
      return {
        productId,
        title: product?.title ?? 'Unknown product',
        slug: product?.slug ?? '',
        views,
        addsToCart,
        purchases,
        conversionRatePct: pct(purchases, views),
      };
    });

    return rows.sort((a, b) => b.views - a.views).slice(0, limit);
  }

  /**
   * Views/adds-to-cart come from ShopBehaviorEvent.countryCode (resolved from
   * the request IP via GeoIpService at write time — offline lookup, raw IP
   * never stored). Purchases use the country already captured on the order's
   * shipping address at checkout, which needs no IP/geoip at all.
   */
  async getCountryBreakdown(
    days = 30,
    limit = 20,
  ): Promise<
    Array<{
      countryCode: string;
      countryName: string;
      views: number;
      addsToCart: number;
      purchases: number;
    }>
  > {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [viewRows, addRows, purchaseRows] = await Promise.all([
      this.behaviorRepo
        .createQueryBuilder('be')
        .select('be.countryCode', 'countryCode')
        .addSelect('COUNT(be.id)', 'count')
        .where(`be.eventType = 'product_view'`)
        .andWhere('be.createdAt >= :since', { since })
        .andWhere('be.countryCode IS NOT NULL')
        .groupBy('be.countryCode')
        .getRawMany<{ countryCode: string; count: string }>(),
      this.behaviorRepo
        .createQueryBuilder('be')
        .select('be.countryCode', 'countryCode')
        .addSelect('COUNT(be.id)', 'count')
        .where(`be.eventType = 'add_to_cart'`)
        .andWhere('be.createdAt >= :since', { since })
        .andWhere('be.countryCode IS NOT NULL')
        .groupBy('be.countryCode')
        .getRawMany<{ countryCode: string; count: string }>(),
      this.orderRepo
        .createQueryBuilder('o')
        // Manually quoted: TypeORM's alias-quoting pass doesn't recognize
        // "o.shippingAddressSnapshot" as a bare column reference once it's
        // immediately followed by the `->>` JSONB operator, so it's left
        // unquoted and Postgres folds it to lowercase (breaking the mixed-
        // case column name) unless quoted explicitly here.
        .select(`"o"."shippingAddressSnapshot"->>'country'`, 'countryCode')
        .addSelect('COUNT(o.id)', 'count')
        .where('o.status IN (:...statuses)', { statuses: PAID_STATUSES })
        .andWhere('o.createdAt >= :since', { since })
        .andWhere(`"o"."shippingAddressSnapshot"->>'country' IS NOT NULL`)
        .groupBy(`"o"."shippingAddressSnapshot"->>'country'`)
        .getRawMany<{ countryCode: string; count: string }>(),
    ]);

    const viewMap = new Map(
      viewRows.map((r) => [r.countryCode, parseInt(r.count, 10)]),
    );
    const addMap = new Map(
      addRows.map((r) => [r.countryCode, parseInt(r.count, 10)]),
    );
    const purchaseMap = new Map(
      purchaseRows.map((r) => [r.countryCode, parseInt(r.count, 10)]),
    );

    const countryCodes = new Set([
      ...viewMap.keys(),
      ...addMap.keys(),
      ...purchaseMap.keys(),
    ]);
    if (countryCodes.size === 0) return [];

    const countries = await this.countryRepo.find({
      where: { isoCode: In([...countryCodes]) },
      select: ['isoCode', 'name'],
    });
    const nameMap = new Map(countries.map((c) => [c.isoCode, c.name]));

    const rows = [...countryCodes].map((countryCode) => ({
      countryCode,
      countryName: nameMap.get(countryCode) ?? countryCode,
      views: viewMap.get(countryCode) ?? 0,
      addsToCart: addMap.get(countryCode) ?? 0,
      purchases: purchaseMap.get(countryCode) ?? 0,
    }));

    return rows
      .sort(
        (a, b) =>
          b.views +
          b.addsToCart +
          b.purchases -
          (a.views + a.addsToCart + a.purchases),
      )
      .slice(0, limit);
  }

  // ── Search insights ──────────────────────────────────────────────────────────

  async getSearchOverview(days = 30): Promise<{
    totalSearches: number;
    zeroResultSearches: number;
    zeroResultRatePct: number;
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const totalSearches = await this.behaviorRepo
      .createQueryBuilder('be')
      .where(`be.eventType = 'search'`)
      .andWhere('be.createdAt >= :since', { since })
      .getCount();

    const zeroResultSearches = await this.behaviorRepo
      .createQueryBuilder('be')
      .where(`be.eventType = 'search'`)
      .andWhere('be.createdAt >= :since', { since })
      .andWhere('be.resultCount = 0')
      .getCount();

    return {
      totalSearches,
      zeroResultSearches,
      zeroResultRatePct: pct(zeroResultSearches, totalSearches),
    };
  }

  async getTopSearches(
    days = 30,
    limit = 20,
  ): Promise<Array<{ query: string; count: number }>> {
    return this.searchGroupedBy(days, limit, false);
  }

  async getZeroResultSearches(
    days = 30,
    limit = 20,
  ): Promise<Array<{ query: string; count: number }>> {
    return this.searchGroupedBy(days, limit, true);
  }

  private async searchGroupedBy(
    days: number,
    limit: number,
    zeroResultOnly: boolean,
  ): Promise<Array<{ query: string; count: number }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const qb = this.behaviorRepo
      .createQueryBuilder('be')
      .select('LOWER(be.searchQuery)', 'query')
      .addSelect('COUNT(be.id)', 'count')
      .where(`be.eventType = 'search'`)
      .andWhere('be.createdAt >= :since', { since })
      .andWhere('be.searchQuery IS NOT NULL');
    if (zeroResultOnly) qb.andWhere('be.resultCount = 0');

    const rows = await qb
      .groupBy('LOWER(be.searchQuery)')
      .orderBy('COUNT(be.id)', 'DESC')
      .limit(limit)
      .getRawMany<{ query: string; count: string }>();

    return rows.map((r) => ({ query: r.query, count: parseInt(r.count, 10) }));
  }

  // ── Wishlist insights ────────────────────────────────────────────────────────

  async getMostWishlisted(limit = 20): Promise<
    Array<{
      productId: string;
      title: string;
      slug: string;
      wishlistCount: number;
    }>
  > {
    const rows = await this.wishlistRepo
      .createQueryBuilder('w')
      .select('w.productId', 'productId')
      .addSelect('COUNT(w.id)', 'count')
      .groupBy('w.productId')
      .orderBy('COUNT(w.id)', 'DESC')
      .limit(limit)
      .getRawMany<{ productId: string; count: string }>();

    if (rows.length === 0) return [];
    const products = await this.productRepo.find({
      where: { id: In(rows.map((r) => r.productId)) },
      select: ['id', 'title', 'slug'],
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    return rows.map((r) => {
      const product = productMap.get(r.productId);
      return {
        productId: r.productId,
        title: product?.title ?? 'Unknown product',
        slug: product?.slug ?? '',
        wishlistCount: parseInt(r.count, 10),
      };
    });
  }

  /**
   * Wishlisted products the same customer never purchased — a direct
   * retargeting list. Only covers customer-linked wishlist items (userId set);
   * guest-only entries (sessionToken) have no reliable link to a completed
   * order, so they're excluded rather than guessed at.
   */
  async getNonConvertingWishlist(limit = 20): Promise<
    Array<{
      productId: string;
      title: string;
      slug: string;
      shopCustomerId: string;
      wishlistedAt: Date;
    }>
  > {
    const items = await this.wishlistRepo.find({
      where: { userId: Not(IsNull()) },
      order: { addedAt: 'DESC' },
      take: 500,
    });
    if (items.length === 0) return [];

    const customerIds = [...new Set(items.map((i) => i.userId as string))];

    const purchasedRows = await this.orderRepo
      .createQueryBuilder('o')
      .innerJoin('shop_order_items', 'i', 'i.orderId = o.id')
      .select('o.customerId', 'customerId')
      .addSelect('i.productId', 'productId')
      .where('o.customerId IN (:...customerIds)', { customerIds })
      .andWhere('o.status IN (:...statuses)', { statuses: PAID_STATUSES })
      .groupBy('o.customerId')
      .addGroupBy('i.productId')
      .getRawMany<{ customerId: string; productId: string }>();

    const purchasedSet = new Set(
      purchasedRows.map((r) => `${r.customerId}:${r.productId}`),
    );

    const nonConverting = items
      .filter((i) => !purchasedSet.has(`${i.userId}:${i.productId}`))
      .slice(0, limit);
    if (nonConverting.length === 0) return [];

    const products = await this.productRepo.find({
      where: { id: In(nonConverting.map((i) => i.productId)) },
      select: ['id', 'title', 'slug'],
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    return nonConverting.map((i) => {
      const product = productMap.get(i.productId);
      return {
        productId: i.productId,
        title: product?.title ?? 'Unknown product',
        slug: product?.slug ?? '',
        shopCustomerId: i.userId as string,
        wishlistedAt: i.addedAt,
      };
    });
  }

  // ── Per-customer behavior timeline ───────────────────────────────────────────

  async getCustomerTimeline(shopCustomerId: string): Promise<TimelineEntry[]> {
    const [behaviorEvents, orders, wishlistItems] = await Promise.all([
      this.behaviorRepo.find({
        where: { shopCustomerId },
        order: { createdAt: 'DESC' },
        take: 200,
      }),
      this.orderRepo.find({
        where: { customerId: shopCustomerId },
        order: { createdAt: 'DESC' },
      }),
      this.wishlistRepo.find({
        where: { userId: shopCustomerId },
        order: { addedAt: 'DESC' },
      }),
    ]);

    const productIds = [
      ...new Set([
        ...behaviorEvents
          .map((e) => e.productId)
          .filter((id): id is string => !!id),
        ...wishlistItems.map((w) => w.productId),
      ]),
    ];
    const products = productIds.length
      ? await this.productRepo.find({
          where: { id: In(productIds) },
          select: ['id', 'title'],
        })
      : [];
    const titleMap = new Map(products.map((p) => [p.id, p.title]));

    const timeline: TimelineEntry[] = [
      ...behaviorEvents.map((e) => ({
        type: e.eventType as string,
        date: e.createdAt,
        productId: e.productId,
        productTitle: e.productId ? titleMap.get(e.productId) ?? null : null,
        searchQuery: e.searchQuery,
        resultCount: e.resultCount,
        quantity: e.quantity,
        orderId: null,
        orderNumber: null,
        orderStatus: null,
        totalCents: null,
      })),
      ...orders.map((o) => ({
        type: 'order',
        date: o.createdAt,
        productId: null,
        productTitle: null,
        searchQuery: null,
        resultCount: null,
        quantity: null,
        orderId: o.id,
        orderNumber: o.orderNumber,
        orderStatus: o.status as string,
        totalCents: o.totalCents,
      })),
      ...wishlistItems.map((w) => ({
        type: 'wishlist_add',
        date: w.addedAt,
        productId: w.productId,
        productTitle: titleMap.get(w.productId) ?? null,
        searchQuery: null,
        resultCount: null,
        quantity: null,
        orderId: null,
        orderNumber: null,
        orderStatus: null,
        totalCents: null,
      })),
    ];

    return timeline.sort((a, b) => b.date.getTime() - a.date.getTime());
  }
}
