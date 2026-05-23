import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../auth/public.decorator';
import { ShopPromotionService } from './shop-promotion.service';
import { PricingEngineService } from './pricing-engine.service';

@Public()
@Controller('public/shop/promotions')
export class PromotionPublicController {
  constructor(
    private readonly promotionSvc: ShopPromotionService,
    private readonly pricingEngine: PricingEngineService,
  ) {}

  /** All active automatic promotions with scope data — used for badge display. */
  @Get('active')
  listActive() {
    return this.promotionSvc.listActiveAutoForPublic();
  }

  /** Best active promotion for a specific product — used on product detail pages. */
  @Get('for-product')
  forProduct(@Query('productId') productId: string) {
    if (!productId) return null;
    return this.pricingEngine.getActiveForProduct(productId);
  }
}
