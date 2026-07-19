import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../auth/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BehaviorTrackingService } from './behavior-tracking.service';

// Restricted to signals with no natural backend mutation to hook into
// (product_view, search) — cart/checkout events are logged from their own
// authoritative backend flows (cart service, order-created listener), never
// accepted as arbitrary client-supplied event types here. Mirrors the same
// restrictive-enum pattern as meta-capi-track.controller.ts.
const TrackBehaviorSchema = z.object({
  eventType: z.enum(['product_view', 'search']),
  cartToken: z.string().max(100).nullish(),
  productId: z.string().uuid().nullish(),
  searchQuery: z.string().max(500).nullish(),
  resultCount: z.number().int().min(0).nullish(),
});
type TrackBehaviorDto = z.infer<typeof TrackBehaviorSchema>;

@Public()
@Controller('public/shop/behavior')
export class BehaviorTrackingController {
  constructor(private readonly behaviorTracking: BehaviorTrackingService) {}

  @Post('track')
  @HttpCode(204)
  async track(
    @Body(new ZodValidationPipe(TrackBehaviorSchema)) dto: TrackBehaviorDto,
  ): Promise<void> {
    await this.behaviorTracking.record(dto.eventType, {
      cartToken: dto.cartToken,
      productId: dto.productId,
      searchQuery: dto.searchQuery,
      resultCount: dto.resultCount,
    });
  }
}
