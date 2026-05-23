import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { Order } from '../entities/order.entity';
import { ShopVendorPayout } from '../entities/shop-vendor-payout.entity';

@Injectable()
export class VendorPortalService {
  constructor(
    @InjectRepository(Product)          private readonly productRepo: Repository<Product>,
    @InjectRepository(Order)            private readonly orderRepo:   Repository<Order>,
    @InjectRepository(ShopVendorPayout) private readonly payoutRepo:  Repository<ShopVendorPayout>,
  ) {}

  async getMyProducts(
    vendorId: string,
    opts: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<{ items: Product[]; total: number }> {
    const { status, limit = 20, offset = 0 } = opts;
    const qb = this.productRepo.createQueryBuilder('p')
      .where('p.vendorId = :vendorId', { vendorId })
      .andWhere('p.deletedAt IS NULL')
      .orderBy('p.createdAt', 'DESC')
      .take(limit)
      .skip(offset);
    if (status) qb.andWhere('p.status = :status', { status });
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getMyOrders(
    vendorId: string,
    opts: { status?: string; limit?: number; offset?: number } = {},
  ): Promise<{ items: any[]; total: number }> {
    const { status, limit = 20, offset = 0 } = opts;
    const qb = this.orderRepo.createQueryBuilder('o')
      .innerJoin('shop_order_items', 'oi', 'oi.orderId = o.id AND oi.vendorId = :vendorId', { vendorId })
      .orderBy('o.createdAt', 'DESC')
      .take(limit)
      .skip(offset);
    if (status) qb.andWhere('o.status = :status', { status });
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getMyPayouts(
    vendorId: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{ items: ShopVendorPayout[]; total: number; totalNetCents: number }> {
    const { limit = 20, offset = 0 } = opts;
    const [items, total] = await this.payoutRepo.findAndCount({
      where:  { vendorId },
      order:  { createdAt: 'DESC' },
      take:   limit,
      skip:   offset,
    });
    const totalNetCents = await this.payoutRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.netCents), 0)', 'sum')
      .where('p.vendorId = :vendorId AND p.status = :s', { vendorId, s: 'transferred' })
      .getRawOne()
      .then(r => Number(r?.sum ?? 0));
    return { items, total, totalNetCents };
  }

  async getMyStats(vendorId: string): Promise<{
    totalProducts: number;
    totalOrders: number;
    totalEarnedCents: number;
    pendingPayoutsCents: number;
  }> {
    const [totalProducts, totalOrders, transferred, pending] = await Promise.all([
      this.productRepo.count({ where: { vendorId } }),
      this.orderRepo.createQueryBuilder('o')
        .innerJoin('shop_order_items', 'oi', 'oi.orderId = o.id AND oi.vendorId = :v', { v: vendorId })
        .getCount(),
      this.payoutRepo.createQueryBuilder('p')
        .select('COALESCE(SUM(p.netCents), 0)', 'sum')
        .where('p.vendorId = :v AND p.status = :s', { v: vendorId, s: 'transferred' })
        .getRawOne().then(r => Number(r?.sum ?? 0)),
      this.payoutRepo.createQueryBuilder('p')
        .select('COALESCE(SUM(p.netCents), 0)', 'sum')
        .where('p.vendorId = :v AND p.status = :s', { v: vendorId, s: 'pending' })
        .getRawOne().then(r => Number(r?.sum ?? 0)),
    ]);

    return {
      totalProducts,
      totalOrders,
      totalEarnedCents:    transferred,
      pendingPayoutsCents: pending,
    };
  }
}
