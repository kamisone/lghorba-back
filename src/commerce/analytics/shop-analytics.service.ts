import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../entities/order.entity';
import { ProductReview } from '../entities/product-review.entity';
import { ShopCustomer } from '../entities/shop-customer.entity';
import { ShopPromotion } from '../entities/shop-promotion.entity';
import { InventoryItem } from '../entities/inventory-item.entity';

@Injectable()
export class ShopAnalyticsService {
  constructor(
    @InjectRepository(Order)         private readonly orderRepo:    Repository<Order>,
    @InjectRepository(ProductReview) private readonly reviewRepo:   Repository<ProductReview>,
    @InjectRepository(ShopCustomer)  private readonly customerRepo: Repository<ShopCustomer>,
    @InjectRepository(ShopPromotion) private readonly promoRepo:    Repository<ShopPromotion>,
    @InjectRepository(InventoryItem) private readonly inventoryRepo: Repository<InventoryItem>,
  ) {}

  async getOverview(days = 30): Promise<{
    totalOrders:      number;
    totalRevenueCents: number;
    avgOrderCents:    number;
    pendingOrders:    number;
    processingOrders: number;
    pendingReviews:   number;
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const revenueRow: { total: string; count: string } | undefined = await this.orderRepo
      .createQueryBuilder('o')
      .select('SUM(o.totalCents)', 'total')
      .addSelect('COUNT(o.id)', 'count')
      .where('o.status IN (:...statuses)', { statuses: ['paid', 'processing', 'shipped', 'delivered'] })
      .andWhere('o.createdAt >= :since', { since })
      .getRawOne();

    const totalRevenueCents = parseInt(revenueRow?.total ?? '0', 10) || 0;
    const totalOrders       = parseInt(revenueRow?.count ?? '0', 10) || 0;
    const avgOrderCents     = totalOrders > 0 ? Math.round(totalRevenueCents / totalOrders) : 0;

    const pendingOrders = await this.orderRepo.count({ where: { status: 'awaiting_payment' } });
    const processingOrders = await this.orderRepo.count({ where: { status: 'processing' } });
    const pendingReviews = await this.reviewRepo.count({ where: { status: 'pending' } });

    return { totalOrders, totalRevenueCents, avgOrderCents, pendingOrders, processingOrders, pendingReviews };
  }

  async getBestSellers(days = 30, limit = 10): Promise<Array<{ productId: string; title: string; totalSold: number; revenueCents: number }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .innerJoin('shop_order_items', 'i', 'i.orderId = o.id')
      .select('i.productId', 'productId')
      .addSelect('MAX(i.titleSnapshot)', 'title')
      .addSelect('SUM(i.quantity)', 'totalSold')
      .addSelect('SUM(i.totalCents)', 'revenueCents')
      .where('o.status IN (:...statuses)', { statuses: ['paid', 'processing', 'shipped', 'delivered'] })
      .andWhere('o.createdAt >= :since', { since })
      .andWhere('i.productId IS NOT NULL')
      .groupBy('i.productId')
      .orderBy('SUM(i.quantity)', 'DESC')
      .limit(limit)
      .getRawMany();

    return rows.map(r => ({
      productId:    r.productId as string,
      title:        r.title as string,
      totalSold:    parseInt(r.totalSold, 10),
      revenueCents: parseInt(r.revenueCents, 10),
    }));
  }

  async getRevenueSeries(days = 30): Promise<Array<{ date: string; revenueCents: number; orders: number }>> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .select(`DATE_TRUNC('day', o.createdAt AT TIME ZONE 'UTC')`, 'day')
      .addSelect('SUM(o.totalCents)', 'revenueCents')
      .addSelect('COUNT(o.id)', 'orders')
      .where('o.status IN (:...statuses)', { statuses: ['paid', 'processing', 'shipped', 'delivered'] })
      .andWhere('o.createdAt >= :since', { since })
      .groupBy(`DATE_TRUNC('day', o.createdAt AT TIME ZONE 'UTC')`)
      .orderBy(`DATE_TRUNC('day', o.createdAt AT TIME ZONE 'UTC')`, 'ASC')
      .getRawMany();

    return rows.map(r => ({
      date:         (r.day as Date).toISOString().slice(0, 10),
      revenueCents: parseInt(r.revenueCents, 10),
      orders:       parseInt(r.orders, 10),
    }));
  }

  async getCustomerInsights(days = 30): Promise<{
    totalCustomers: number;
    newCustomers:   number;
    topSpenders: Array<{ customerId: string; email: string; totalCents: number; orderCount: number }>;
  }> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const totalCustomers = await this.customerRepo.count();
    const newCustomers   = await this.customerRepo
      .createQueryBuilder('c')
      .where('c.createdAt >= :since', { since })
      .getCount();

    const spenders = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.customerEmail', 'email')
      .addSelect('o.customerId', 'customerId')
      .addSelect('SUM(o.totalCents)', 'totalCents')
      .addSelect('COUNT(o.id)', 'orderCount')
      .where('o.status IN (:...statuses)', { statuses: ['paid', 'processing', 'shipped', 'delivered'] })
      .andWhere('o.customerId IS NOT NULL')
      .groupBy('o.customerId')
      .addGroupBy('o.customerEmail')
      .orderBy('SUM(o.totalCents)', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      totalCustomers,
      newCustomers,
      topSpenders: spenders.map(r => ({
        customerId:  r.customerId as string,
        email:       r.email as string,
        totalCents:  parseInt(r.totalCents, 10),
        orderCount:  parseInt(r.orderCount, 10),
      })),
    };
  }

  async getPromotionPerformance(): Promise<Array<{
    code: string; name: string; usesCount: number; discountCents: number;
  }>> {
    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.couponCode', 'code')
      .addSelect('SUM(o.discountCents)', 'discountCents')
      .addSelect('COUNT(o.id)', 'orderCount')
      .where('o.couponCode IS NOT NULL')
      .andWhere('o.status IN (:...statuses)', { statuses: ['paid', 'processing', 'shipped', 'delivered'] })
      .groupBy('o.couponCode')
      .orderBy('SUM(o.discountCents)', 'DESC')
      .getRawMany();

    const promos = await this.promoRepo.find({ select: ['code', 'name', 'usesCount'] });
    const nameMap = new Map(promos.map(p => [p.code, p.name]));

    return rows.map(r => ({
      code:         r.code as string,
      name:         nameMap.get(r.code) ?? r.code as string,
      usesCount:    parseInt(r.orderCount, 10),
      discountCents: parseInt(r.discountCents, 10),
    }));
  }

  async getInventoryAnalytics(): Promise<{
    totalItems:     number;
    outOfStock:     number;
    lowStock:       number;
    lowStockItems: Array<{ variantId: string; productId: string; available: number; lowStockThreshold: number }>;
  }> {
    const totalItems = await this.inventoryRepo.count();
    const outOfStock = await this.inventoryRepo
      .createQueryBuilder('i')
      .where('i.available = 0')
      .getCount();
    const lowStock = await this.inventoryRepo
      .createQueryBuilder('i')
      .where('i.available > 0 AND i.available <= i."lowStockThreshold"')
      .getCount();

    const lowStockItems = await this.inventoryRepo
      .createQueryBuilder('i')
      .where('i.available > 0 AND i.available <= i."lowStockThreshold"')
      .orderBy('i.available', 'ASC')
      .limit(20)
      .getMany();

    return {
      totalItems,
      outOfStock,
      lowStock,
      lowStockItems: lowStockItems.map(i => ({
        variantId:         i.variantId,
        productId:         i.productId,
        available:         i.available,
        lowStockThreshold: i.lowStockThreshold,
      })),
    };
  }
}
