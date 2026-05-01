import { Body, Controller, Get, Param, Post, Req, UsePipes } from '@nestjs/common';
import { Request } from 'express';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { Public } from '../auth/public.decorator';
import { ExecuteGuestActionDto, ExecuteGuestActionSchema } from './dto/execute-guest-action.dto';
import { GuestTokenService } from './guest-token.service';

@Public()
@Controller('guest-access')
export class GuestAccessController {
  constructor(private readonly guestTokenService: GuestTokenService) {}

  @Get(':token/info')
  async getInfo(@Param('token') rawToken: string, @Req() req: Request) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? null;
    const token = await this.guestTokenService.getInfo(rawToken, ip);
    return {
      carId:          token.carId,
      label:          token.label,
      allowedActions: token.allowedActions,
      expiresAt:      token.expiresAt,
      usageCount:     token.usageCount,
    };
  }

  @Get(':token/car-status')
  async getCarStatus(@Param('token') rawToken: string) {
    return this.guestTokenService.getCarStatus(rawToken);
  }

  @Post(':token/action')
  @UsePipes(new ZodValidationPipe(ExecuteGuestActionSchema))
  async executeAction(
    @Param('token') rawToken: string,
    @Body() dto: ExecuteGuestActionDto,
    @Req() req: Request,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket.remoteAddress
      ?? null;
    const ua = req.headers['user-agent'] ?? null;
    await this.guestTokenService.enqueueAction(rawToken, dto.action, ip, ua);
    return { queued: true };
  }
}
