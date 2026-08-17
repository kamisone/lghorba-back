import { Body, Controller, HttpCode, Logger, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { Public } from '../../auth/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { resolveClientIp } from '../../common/utils/client-ip.util';
import { ReplayTrackingService } from './replay-tracking.service';

// Session replay is scoped to test-product landing pages only (enforced
// server-side in ProductService.findById via isTestProduct — see
// startSession's caller) — a deliberate privacy-minimization choice: test
// products can't be purchased and draw a small, controlled audience, not
// ordinary shoppers moving through checkout with real PII on-screen.
const StartSessionSchema = z.object({
  productId: z.string().uuid(),
  cartToken: z.string().max(100).nullish(),
  pageUrl: z.string().max(500).nullish(),
  pageTitle: z.string().max(300).nullish(),
  viewportWidth: z.number().nullish(),
  viewportHeight: z.number().nullish(),
  referrer: z.string().max(500).nullish(),
  utmSource: z.string().max(100).nullish(),
});

// `events` are opaque rrweb event objects — validated for shape (array,
// size caps) in the service, not field-by-field here; rrweb's event schema
// is large/versioned and re-declaring it in a Zod schema would be exactly
// the kind of unnecessary new pattern this feature should avoid.
const IngestBatchSchema = z.object({
  events: z.array(z.unknown()).max(500),
  markers: z.array(z.unknown()).max(200).optional(),
});

const EndSessionSchema = z.object({
  markers: z.array(z.unknown()).max(200).optional(),
});

@Public()
@Controller('public/shop/replay/sessions')
export class ReplayTrackingController {
  private readonly logger = new Logger(ReplayTrackingController.name);

  constructor(private readonly replay: ReplayTrackingService) {}

  @Post()
  async start(
    @Body(new ZodValidationPipe(StartSessionSchema)) dto: z.infer<typeof StartSessionSchema>,
    @Req() req: Request,
  ): Promise<{ sessionId: string } | Record<string, never>> {
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? '';
    const session = await this.replay.startSession({
      productId: dto.productId,
      cartToken: dto.cartToken,
      pageUrl: dto.pageUrl,
      pageTitle: dto.pageTitle,
      viewportWidth: dto.viewportWidth,
      viewportHeight: dto.viewportHeight,
      clientIp: resolveClientIp(req),
      userAgent,
      referrer: dto.referrer,
      utmSource: dto.utmSource,
    });
    // No session (excluded visitor, bot, or not a test product): return an
    // empty body rather than a 4xx — the recorder treats a missing
    // sessionId as "don't record", with no error to handle or retry.
    return session ? { sessionId: session.id } : {};
  }

  @Post(':id/events')
  @HttpCode(204)
  async events(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(IngestBatchSchema)) dto: z.infer<typeof IngestBatchSchema>,
  ): Promise<void> {
    await this.replay.ingestBatch({ sessionId: id, events: dto.events, markers: dto.markers });
  }

  // sendBeacon on page unload — no Authorization header is attached by the
  // browser for a beacon request, but this endpoint is @Public() anyway
  // (every other ingest call here is unauthenticated for the same reason:
  // it's a storefront visitor, not an admin).
  @Post(':id/end')
  @HttpCode(204)
  async end(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(EndSessionSchema)) dto: z.infer<typeof EndSessionSchema>,
  ): Promise<void> {
    await this.replay.endSession(id, dto.markers);
  }
}
