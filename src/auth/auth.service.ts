import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AdminsService } from '../admins/admins.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { MfaChallengeResult, MfaService } from './mfa.service';

export type LoginResult =
  | { access_token: string; refresh_token: string }
  | ({ mfaRequired: true } & MfaChallengeResult);

export type TokenPair = { access_token: string; refresh_token: string };

// Refresh tokens are valid for 15 days and rotated on every use.
const REFRESH_TOKEN_TTL = '15d';
const REFRESH_TOKEN_TTL_MS = 15 * 24 * 60 * 60 * 1000;

interface RefreshTokenPayload {
  sub: string;
  email: string;
  jti: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly adminsService: AdminsService,
    private readonly jwtService: JwtService,
    private readonly mfaService: MfaService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const admin = await this.adminsService.findByEmail(email);
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      this.logger.warn(`login: failed attempt for email=${email} (admin ${admin ? 'found' : 'not found'})`);
      throw new UnauthorizedException();
    }

    if (admin.mfaEnabled) {
      const challenge = await this.mfaService.initChallenge(admin.id, admin.email, admin.preferredMfaMethod);
      return { mfaRequired: true, ...challenge };
    }

    return this.issueTokens(admin.id, admin.email);
  }

  async verifyMfa(challengeToken: string, otp: string): Promise<TokenPair> {
    const { adminId, email } = await this.mfaService.verify(challengeToken, otp);
    return this.issueTokens(adminId, email);
  }

  /**
   * Refresh-token rotation: validates the presented refresh token against
   * the persisted record, revokes it, and issues a brand-new access/refresh
   * pair. A revoked-but-presented token indicates reuse (theft) — the entire
   * token family for that admin is revoked, forcing re-login everywhere.
   */
  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!payload.jti) throw new UnauthorizedException('Invalid refresh token');

    const stored = await this.refreshTokenRepo.findOneBy({ id: payload.jti });
    if (!stored || stored.adminId !== payload.sub) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.revokedAt) {
      this.logger.warn(`refresh: reuse of revoked token detected for admin=${stored.adminId} — revoking all sessions`);
      await this.refreshTokenRepo.update(
        { adminId: stored.adminId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      throw new UnauthorizedException('Refresh token has already been used');
    }

    if (stored.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const tokens = await this.issueTokens(payload.sub, payload.email);
    const { jti: newJti } = this.jwtService.decode<RefreshTokenPayload>(tokens.refresh_token);

    stored.revokedAt = new Date();
    stored.replacedByTokenId = newJti;
    await this.refreshTokenRepo.save(stored);

    return tokens;
  }

  /** Revokes the refresh token for this session (called on logout). */
  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
        ignoreExpiration: true,
      });
      if (payload.jti) {
        await this.refreshTokenRepo.update({ id: payload.jti }, { revokedAt: new Date() });
      }
    } catch {
      // Invalid/garbage token — nothing to revoke.
    }
  }

  private async issueTokens(sub: string, email: string): Promise<TokenPair> {
    const access_token = this.jwtService.sign({ sub, email });

    const record = await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        adminId: sub,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      }),
    );

    const refresh_token = this.jwtService.sign(
      { sub, email, jti: record.id },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: REFRESH_TOKEN_TTL },
    );

    return { access_token, refresh_token };
  }
}
