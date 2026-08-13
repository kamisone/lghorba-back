import { Body, Controller, Get, HttpCode, Logger, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { Public } from '../../auth/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { BehaviorTrackingService } from './behavior-tracking.service';
import { GeoIpService } from './geo-ip.service';
import { resolveClientIp, ORIGINAL_CLIENT_IP_HEADER } from '../../common/utils/client-ip.util';

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

  /**
   * Diagnostic: reports what this service sees as the caller's address, and what
   * that resolves to. Echoes only the caller's own request metadata — nothing
   * about anyone else — so it is safe to leave public.
   *
   * Hit it through each entry point to find where a visitor's IP is lost:
   *   /api/public/shop/behavior/ip-debug       (ingress -> backend)
   *   /next-api/public/shop/behavior/ip-debug  (ingress -> Next.js proxy -> backend)
   * A private/loopback `reqIp` means that hop is not forwarding the address.
   */
  @Get('ip-debug')
  ipDebug(@Req() req: Request) {
    const ip = resolveClientIp(req);
    return {
      reqIp: ip,
      rawReqIp: req.ip ?? null,
      resolvedCountry: this.geoIp.countryFromIp(ip),
      trustProxyWorking: !!ip && !/^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip),
      received: {
        'x-forwarded-for': req.headers['x-forwarded-for'] ?? null,
        'x-real-ip': req.headers['x-real-ip'] ?? null,
        [ORIGINAL_CLIENT_IP_HEADER]: req.headers[ORIGINAL_CLIENT_IP_HEADER] ?? null,
      },
    };
  }

  @Post('track')
  @HttpCode(204)
  async track(
    @Body(new ZodValidationPipe(TrackBehaviorSchema)) dto: TrackBehaviorDto,
    @Req() req: Request,
  ): Promise<void> {
    // Single resolver for every entry point — prefers the edge header the k8s
    // ingress cannot overwrite, falls back to `req.ip` (correct wherever
    // `trust proxy` can see a genuine X-Forwarded-For).
    const ip = resolveClientIp(req);
    const countryCode = this.geoIp.countryFromIp(ip);

    if (!countryCode) {
      // The only way to tell "visitor we cannot geolocate" apart from "proxy
      // misconfigured, so every event is a private address" is to see the chain.
      this.logger.warn(
        `No country for behaviour event: resolved=${ip} req.ip=${req.ip} ` +
          `x-forwarded-for="${(req.headers['x-forwarded-for'] as string) ?? ''}" ` +
          `x-original-client-ip="${(req.headers[ORIGINAL_CLIENT_IP_HEADER] as string) ?? ''}"`,
      );
    }

    await this.behaviorTracking.record(dto.eventType, {
      cartToken: dto.cartToken,
      productId: dto.productId,
      searchQuery: dto.searchQuery,
      resultCount: dto.resultCount,
      countryCode,
      visitorHash: this.geoIp.visitorHashFromIp(ip),
      clientIp: ip,
      // Always a string (possibly '') so record() knows to run the bot
      // check — this is the one caller of record() that has a real request
      // to check a User-Agent against.
      userAgent: (req.headers['user-agent'] as string | undefined) ?? '',
    });
  }
}
