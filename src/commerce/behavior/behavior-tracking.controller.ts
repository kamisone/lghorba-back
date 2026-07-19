import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { Public } from '../../auth/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BehaviorTrackingService } from './behavior-tracking.service';
import { GeoIpService } from './geo-ip.service';

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
  constructor(
    private readonly behaviorTracking: BehaviorTrackingService,
    private readonly geoIp: GeoIpService,
  ) {}

  @Post('track')
  @HttpCode(204)
  async track(
    @Body(new ZodValidationPipe(TrackBehaviorSchema)) dto: TrackBehaviorDto,
    @Req() req: Request,
  ): Promise<void> {
    const forwarded = ((req.headers['x-forwarded-for'] as string) ?? '')
      .split(',')[0]
      .trim();
    const ip = req.ip ?? (forwarded || null);

    await this.behaviorTracking.record(dto.eventType, {
      cartToken: dto.cartToken,
      productId: dto.productId,
      searchQuery: dto.searchQuery,
      resultCount: dto.resultCount,
      countryCode: this.geoIp.countryFromIp(ip),
    });
  }
}
