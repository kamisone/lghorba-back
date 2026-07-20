import { Controller, Get, Post, Query } from '@nestjs/common';
import { ShopAnalyticsAggregatorService } from './shop-analytics-aggregator.service';
import { ShopAnalyticsService } from './shop-analytics.service';
import { ShopBehaviorAnalyticsService } from './shop-behavior-analytics.service';

@Controller('admin/shop/analytics')
export class ShopAnalyticsController {
  constructor(
    private readonly aggregator: ShopAnalyticsAggregatorService,
    private readonly analytics: ShopAnalyticsService,
    private readonly behaviorAnalytics: ShopBehaviorAnalyticsService,
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
  async bestSellers(
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    const d = days ? parseInt(days, 10) : 30;
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

  @Get('conversion-funnel')
  conversionFunnel(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.behaviorAnalytics.getConversionFunnel(d);
  }

  // Demand validation for test products: views → cart → reached checkout.
  @Get('test-products')
  testProducts(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.behaviorAnalytics.getTestProductDemand(d);
  }

  @Get('conversion-by-product')
  conversionByProduct(
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    const d = days ? parseInt(days, 10) : 30;
    const lim = limit ? parseInt(limit, 10) : 20;
    return this.behaviorAnalytics.getProductConversion(d, lim);
  }

  @Get('country-breakdown')
  countryBreakdown(
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    const d = days ? parseInt(days, 10) : 30;
    const lim = limit ? parseInt(limit, 10) : 20;
    return this.behaviorAnalytics.getCountryBreakdown(d, lim);
  }

  @Get('search-overview')
  searchOverview(@Query('days') days?: string) {
    const d = days ? parseInt(days, 10) : 30;
    return this.behaviorAnalytics.getSearchOverview(d);
  }

  @Get('top-searches')
  topSearches(@Query('days') days?: string, @Query('limit') limit?: string) {
    const d = days ? parseInt(days, 10) : 30;
    const lim = limit ? parseInt(limit, 10) : 20;
    return this.behaviorAnalytics.getTopSearches(d, lim);
  }

  @Get('zero-result-searches')
  zeroResultSearches(
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    const d = days ? parseInt(days, 10) : 30;
    const lim = limit ? parseInt(limit, 10) : 20;
    return this.behaviorAnalytics.getZeroResultSearches(d, lim);
  }
}
