import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
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
