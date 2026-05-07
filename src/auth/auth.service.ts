import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AdminsService } from '../admins/admins.service';
import { MfaChallengeResult, MfaService } from './mfa.service';

export type LoginResult =
  | { access_token: string; refresh_token: string }
  | ({ mfaRequired: true } & MfaChallengeResult);

@Injectable()
export class AuthService {
  constructor(
    private readonly adminsService: AdminsService,
    private readonly jwtService: JwtService,
    private readonly mfaService: MfaService,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const admin = await this.adminsService.findByEmail(email);
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      throw new UnauthorizedException();
    }

    if (admin.mfaEnabled) {
      const challenge = await this.mfaService.initChallenge(admin.id, admin.email, admin.preferredMfaMethod);
      return { mfaRequired: true, ...challenge };
    }

    return this.issueTokens(admin.id, admin.email);
  }

  async verifyMfa(challengeToken: string, otp: string): Promise<{ access_token: string; refresh_token: string }> {
    const { adminId, email } = await this.mfaService.verify(challengeToken, otp);
    return this.issueTokens(adminId, email);
  }

  refresh(refreshToken: string): { access_token: string } {
    let payload: { sub: string; email: string };
    try {
      payload = this.jwtService.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    const access_token = this.jwtService.sign({ sub: payload.sub, email: payload.email });
    return { access_token };
  }

  private issueTokens(sub: string, email: string): { access_token: string; refresh_token: string } {
    const payload      = { sub, email };
    const access_token = this.jwtService.sign(payload);
    const refresh_token = this.jwtService.sign(payload, {
      secret:     process.env.JWT_REFRESH_SECRET,
      expiresIn: '5d',
    });
    return { access_token, refresh_token };
  }
}
