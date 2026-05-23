import { Controller, Get, Post, Query } from '@nestjs/common';
import { ShopAnalyticsAggregatorService } from './shop-analytics-aggregator.service';
import { ShopAnalyticsService } from './shop-analytics.service';

@Controller('admin/shop/analytics')
export class ShopAnalyticsController {
  constructor(
    private readonly aggregator: ShopAnalyticsAggregatorService,
    private readonly analytics:  ShopAnalyticsService,
  ) {}

  @Get('overview')
  async overview(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    const [data, computedAt] = await Promise.all([
      this.aggregator.getOverviewCached(d === 7 ? 7 : 30),
      this.aggregator.getComputedAt(),
    ]);
    return { ...data, computedAt };
  }

  @Get('best-sellers')
  async bestSellers(@Query('days') days?: string, @Query('limit') limit?: string) {
    const d   = days  ? parseInt(days,  10) : 30;
    const lim = limit ? parseInt(limit, 10) : 10;
    return this.aggregator.getBestSellersCached(d === 7 ? 7 : 30, lim);
  }

  @Get('revenue-series')
  revenueSeries(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.aggregator.getRevenueSeriesCached(d === 7 ? 7 : 30);
  }

  // Force re-aggregation on demand (e.g. after a data import)
  @Post('aggregate')
  async aggregate() {
    await this.aggregator.aggregate();
    return { ok: true, computedAt: await this.aggregator.getComputedAt() };
  }

  @Get('customers')
  customers(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.analytics.getCustomerInsights(d);
  }

  @Get('promotions')
  promotions() {
    return this.analytics.getPromotionPerformance();
  }

  @Get('inventory')
  inventory() {
    return this.analytics.getInventoryAnalytics();
  }
}
