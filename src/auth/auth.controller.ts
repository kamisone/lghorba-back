import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { LoginDto, LoginSchema } from './dto/login.dto';
import { RefreshDto, RefreshSchema } from './dto/refresh.dto';
import { MfaSendDto, MfaSendSchema } from './dto/mfa-send.dto';
import { MfaVerifyDto, MfaVerifySchema } from './dto/mfa-verify.dto';
import { Public } from './public.decorator';

// 10 attempts per 15 minutes per IP for all auth endpoints
@UseGuards(ThrottlerGuard)
@Throttle({ auth: { ttl: 15 * 60 * 1000, limit: 10 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
  ) {}

  // SkipThrottle() with no args only skips a throttler named "default", which
  // doesn't exist here — ThrottlerModule registers "auth" and "contact". Since
  // this controller is under @Throttle({ auth: ... }), every named throttler
  // (including "contact") otherwise applies to this route too. Must list all.
  @SkipThrottle({ auth: true, contact: true })
  @Get('me')
  me(@Request() req: { user: { id: number; email: string } }) {
    return req.user;
  }

  @Public()
  @Post('login')
  login(@Body(new ZodValidationPipe(LoginSchema)) body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @Public()
  @Post('refresh')
  refresh(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshDto) {
    return this.authService.refresh(body.refresh_token);
  }

  @Public()
  @Post('logout')
  async logout(@Body(new ZodValidationPipe(RefreshSchema)) body: RefreshDto) {
    await this.authService.logout(body.refresh_token);
    return { ok: true };
  }

  @Public()
  @Post('mfa/send')
  mfaSend(@Body(new ZodValidationPipe(MfaSendSchema)) body: MfaSendDto) {
    return this.mfaService.resend(body.challengeToken, body.method);
  }

  @Public()
  @Post('mfa/verify')
  mfaVerify(@Body(new ZodValidationPipe(MfaVerifySchema)) body: MfaVerifyDto) {
    return this.authService.verifyMfa(body.challengeToken, body.otp);
  }
}
