import {
  Body, Controller, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { z } from 'zod';
import { VendorService } from './vendor.service';
import { VendorConnectService } from './vendor-connect.service';
import { VendorStatus } from '../entities/shop-vendor.entity';
import { Order } from '../entities/order.entity';

const StatusSchema  = z.object({ status: z.enum(['pending', 'active', 'suspended']) });
const FeeSchema     = z.object({ platformFeeBps: z.number().int().min(0).max(5000) });

@Controller('admin/shop/vendors')
export class VendorAdminController {
  constructor(
    private readonly vendorService:        VendorService,
    private readonly vendorConnectService: VendorConnectService,
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
  ) {}

  @Get()
  list(
    @Query('status') status?: VendorStatus,
    @Query('limit')  limit  = 20,
    @Query('offset') offset = 0,
  ) {
    return this.vendorService.findAll({ status, limit: Number(limit), offset: Number(offset) });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vendorService.findById(id);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: unknown) {
    const { status } = StatusSchema.parse(body);
    return this.vendorService.updateStatus(id, status);
  }

  @Get(':id/payouts')
  listPayouts(
    @Param('id')     vendorId: string,
    @Query('limit')  limit  = 20,
    @Query('offset') offset = 0,
  ) {
    return this.vendorConnectService.listPayouts({ vendorId, limit: Number(limit), offset: Number(offset) });
  }

  @Get('analytics/performance')
  async vendorPerformance(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    const since = new Date(Date.now() - d * 24 * 60 * 60 * 1000);

    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .innerJoin('shop_order_items', 'i', 'i."orderId" = o.id')
      .select('i."vendorId"', 'vendorId')
      .addSelect('COUNT(DISTINCT o.id)', 'orderCount')
      .addSelect('SUM(i."totalCents")',  'revenueCents')
      .addSelect('SUM(i.quantity)',      'itemsSold')
      .where('o.status IN (:...statuses)', { statuses: ['paid', 'processing', 'shipped', 'delivered'] })
      .andWhere('o."createdAt" >= :since', { since })
      .andWhere('i."vendorId" IS NOT NULL')
      .groupBy('i."vendorId"')
      .orderBy('SUM(i."totalCents")', 'DESC')
      .getRawMany();

    return rows.map(r => ({
      vendorId:     r.vendorId as string,
      orderCount:   parseInt(r.orderCount, 10),
      revenueCents: parseInt(r.revenueCents, 10),
      itemsSold:    parseInt(r.itemsSold, 10),
    }));
  }
}
