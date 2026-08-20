import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { Public } from '../../auth/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { TikTokEventsService } from './tiktok-events.service';

// Restricted to page/query-view events with no backend mutation to hook into
// (ViewContent, Search) — AddToCart/InitiateCheckout/Purchase are sent from
// their own authoritative backend flows (cart, checkout, payment), never
// accepted as arbitrary client-supplied event names here. Mirrors
// MetaCapiTrackController exactly.
const TrackEventSchema = z.object({
  eventName: z.enum(['ViewContent', 'Search']),
  eventId: z.string().min(1).max(200),
  eventSourceUrl: z.string().url().max(2000),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
  ttclid: z.string().max(500).nullish(),
  ttp: z.string().max(500).nullish(),
});
type TrackEventDto = z.infer<typeof TrackEventSchema>;

@Public()
@Controller('public/shop/tiktok-events')
export class TikTokEventsTrackController {
  constructor(private readonly tiktokEvents: TikTokEventsService) {}

  @Post('track')
  @HttpCode(204)
  async track(
    @Body(new ZodValidationPipe(TrackEventSchema)) dto: TrackEventDto,
    @Req() req: Request,
  ): Promise<void> {
    const forwarded = ((req.headers['x-forwarded-for'] as string) ?? '')
      .split(',')[0]
      .trim();
    const ip = req.ip ?? (forwarded || null);
    const userAgent = (req.headers['user-agent'] as string) ?? null;

    await this.tiktokEvents.sendEvent({
      eventName: dto.eventName,
      eventId: dto.eventId,
      eventSourceUrl: dto.eventSourceUrl,
      properties: dto.properties,
      clientIpAddress: ip,
      clientUserAgent: userAgent,
      ttclid: dto.ttclid,
      ttp: dto.ttp,
    });
  }
}
