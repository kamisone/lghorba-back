import {
  Body, Controller, Get, Headers, Post, HttpCode, UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
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
@Controller('support/guest')
export class SupportGuestController {
  constructor(
    private readonly convService: SupportConversationsService,
    private readonly jwtService: JwtService,
  ) {}

  // Strict bootstrap limit: 5 req / min / IP
  @UseGuards(ThrottlerGuard)
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
  @UseGuards(ThrottlerGuard)
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

  // BFF-internal endpoint — called only by the Next.js server, never by browsers.
  // No throttle guard at all: the httpOnly cookie check in the BFF is the security
  // boundary, and all BFF requests share one IP so per-IP limiting would lock everyone out.
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
