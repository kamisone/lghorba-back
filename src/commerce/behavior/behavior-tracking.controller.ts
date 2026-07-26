import { Body, Controller, HttpCode, Logger, Post, Req } from '@nestjs/common';
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
  private readonly logger = new Logger(BehaviorTrackingController.name);

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
    // `req.ip` is authoritative once `trust proxy` is configured (see main.ts):
    // Express walks x-forwarded-for past the trusted internal hops for us. Do not
    // reintroduce a manual `x-forwarded-for` parse here — the old code read the
    // header and then discarded it, because `req.ip ?? …` never falls through.
    const ip = req.ip ?? null;
    const countryCode = this.geoIp.countryFromIp(ip);

    if (!countryCode) {
      // The only way to tell "visitor we cannot geolocate" apart from "proxy
      // misconfigured, so every event is a private address" is to see the chain.
      this.logger.warn(
        `No country for behaviour event: req.ip=${ip} ` +
          `x-forwarded-for="${(req.headers['x-forwarded-for'] as string) ?? ''}"`,
      );
    }

    await this.behaviorTracking.record(dto.eventType, {
      cartToken: dto.cartToken,
      productId: dto.productId,
      searchQuery: dto.searchQuery,
      resultCount: dto.resultCount,
      countryCode,
    });
  }
}
