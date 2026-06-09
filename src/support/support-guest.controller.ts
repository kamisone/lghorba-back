import {
  Body, Controller, Get, Headers, Post, HttpCode, UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { SupportConversationsService } from './support-conversations.service';
import { BootstrapSchema, BootstrapDto } from './dto/send-message.dto';
import { GUEST_WS_TICKET_TTL } from './support.constants';

function extractGuestToken(header: string | undefined): string | null {
  if (!header || !/^[0-9a-f-]{36}$/i.test(header.trim())) return null;
  return header.trim();
}

@Public()
@UseGuards(ThrottlerGuard)
@Controller('support/guest')
export class SupportGuestController {
  constructor(
    private readonly convService: SupportConversationsService,
    private readonly jwtService: JwtService,
  ) {}

  // Strict bootstrap limit: 5 req / min / IP
  @Throttle({ auth: { ttl: 60_000, limit: 5 } })
  @Post('bootstrap')
  @HttpCode(200)
  async bootstrap(
    @Headers('x-support-token') tokenHeader: string | undefined,
    @Body(new ZodValidationPipe(BootstrapSchema)) dto: BootstrapDto,
  ) {
    const guestToken = extractGuestToken(tokenHeader);
    if (!guestToken) throw new UnauthorizedException('invalid_token');
    return this.convService.bootstrap(guestToken, dto.guestName);
  }

  // Looser history limit: 30 req / min / IP
  @Throttle({ auth: { ttl: 60_000, limit: 30 } })
  @Get('history')
  async history(
    @Headers('x-support-token') tokenHeader: string | undefined,
    @Headers('x-support-since') since: string | undefined,
  ) {
    const guestToken = extractGuestToken(tokenHeader);
    if (!guestToken) return { messages: [] };

    const conv = await this.convService.getByGuestToken(guestToken);
    if (!conv) return { messages: [] };

    const { messages } = await this.convService.bootstrap(guestToken, undefined, since);
    return { messages, conversationId: conv.id, status: conv.status, unreadGuestCount: conv.unreadGuestCount };
  }

  // ws-ticket is a BFF-internal endpoint: the Next.js server calls it, not browsers.
  // All BFF requests share one source IP, so per-IP throttling would block all users
  // simultaneously. The real security boundary is the httpOnly cookie check in the BFF.
  @SkipThrottle()
  @Post('ws-ticket')
  @HttpCode(200)
  async getWsTicket(@Headers('x-support-token') tokenHeader: string | undefined) {
    const guestToken = extractGuestToken(tokenHeader);
    if (!guestToken) throw new UnauthorizedException('invalid_token');

    const ticket = this.jwtService.sign(
      { guestToken, purpose: 'guest-ws' },
      { expiresIn: GUEST_WS_TICKET_TTL },
    );

    return { ticket };
  }
}
