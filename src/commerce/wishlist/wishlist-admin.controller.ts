import { Controller, Get, Query } from '@nestjs/common';
import { ShopBehaviorAnalyticsService } from '../analytics/shop-behavior-analytics.service';

@Controller('admin/shop/wishlists')
export class WishlistAdminController {
  constructor(
    private readonly behaviorAnalytics: ShopBehaviorAnalyticsService,
  ) {}

  @Get('most-wishlisted')
  mostWishlisted(@Query('limit') limit?: string) {
    return this.behaviorAnalytics.getMostWishlisted(
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Get('non-converting')
  nonConverting(@Query('limit') limit?: string) {
    return this.behaviorAnalytics.getNonConvertingWishlist(
      limit ? parseInt(limit, 10) : 20,
    );
  }
}
