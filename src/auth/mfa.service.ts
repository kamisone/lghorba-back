import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { MfaMethod } from '../admins/admin.entity';
import { AdminsService } from '../admins/admins.service';
import { RedisService } from '../redis/redis.service';
import { MfaNotificationService } from './mfa-notification.service';

export interface MfaChallengePayload {
  sub: string;     // adminId
  email: string;
  jti: string;     // unique token id for Redis key
  type: 'mfa-challenge';
}

export interface MfaChallengeResult {
  challengeToken: string;
  availableMethods: MfaMethod[];
  preferredMethod: MfaMethod;
  maskedDestination: string;
}

const OTP_TTL_SEC   = 5 * 60;   // 5 minutes
const COOLDOWN_SEC  = 60;        // 60 seconds between sends
const RL_MAX        = 5;         // max OTP sends per window
const RL_TTL_SEC    = 15 * 60;  // 15-minute rate-limit window

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);

  constructor(
    private readonly adminsService: AdminsService,
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
    private readonly notifications: MfaNotificationService,
  ) {}

  /** Issue a fresh challenge and immediately send the first OTP. */
  async initChallenge(adminId: string, email: string, preferredMethod: MfaMethod): Promise<MfaChallengeResult> {
    const admin = await this.adminsService.findById(adminId);
    if (!admin) throw new UnauthorizedException();

    const availableMethods: MfaMethod[] = ['email'];
    if (admin.phone) availableMethods.push('sms');

    const jti = crypto.randomUUID();
    const payload: MfaChallengePayload = { sub: adminId, email, jti, type: 'mfa-challenge' };
    const challengeToken = this.jwtService.sign(payload, {
      secret: process.env.MFA_CHALLENGE_SECRET ?? process.env.JWT_SECRET,
      expiresIn: '5m',
    });

    // Send first OTP automatically
    const method = availableMethods.includes(preferredMethod) ? preferredMethod : availableMethods[0];
    const maskedDestination = await this.sendOtp(admin, jti, method);

    return { challengeToken, availableMethods, preferredMethod: method, maskedDestination };
  }

  /** Resend OTP (or switch method). */
  async resend(challengeToken: string, method?: MfaMethod): Promise<{ maskedDestination: string }> {
    const payload = this.verifyChallengeToken(challengeToken);
    const admin   = await this.adminsService.findById(payload.sub);
    if (!admin) throw new UnauthorizedException();

    const availableMethods: MfaMethod[] = ['email'];
    if (admin.phone) availableMethods.push('sms');

    const chosenMethod = method && availableMethods.includes(method) ? method : admin.preferredMfaMethod;
    const maskedDestination = await this.sendOtp(admin, payload.jti, chosenMethod);
    return { maskedDestination };
  }

  /** Verify OTP and return the admin id if valid. */
  async verify(challengeToken: string, otp: string): Promise<{ adminId: string; email: string }> {
    const payload = this.verifyChallengeToken(challengeToken);

    const storedHash = await this.redis.client.get(`mfa:otp:${payload.jti}`);
    if (!storedHash) {
      throw new BadRequestException('OTP expired or not found');
    }

    const valid = await bcrypt.compare(otp, storedHash);
    if (!valid) {
      throw new BadRequestException('Invalid OTP');
    }

    // Consume the OTP so it cannot be reused
    await this.redis.client.del(`mfa:otp:${payload.jti}`);

    return { adminId: payload.sub, email: payload.email };
  }

  // ── private helpers ────────────────────────────────────────────────────────

  private verifyChallengeToken(token: string): MfaChallengePayload {
    try {
      const payload = this.jwtService.verify<MfaChallengePayload>(token, {
        secret: process.env.MFA_CHALLENGE_SECRET ?? process.env.JWT_SECRET,
      });
      if (payload.type !== 'mfa-challenge') throw new Error('wrong type');
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired challenge token');
    }
  }

  private async sendOtp(
    admin: { id: string; email: string; phone: string | null },
    jti: string,
    method: MfaMethod,
  ): Promise<string> {
    // Rate-limit: max RL_MAX sends per RL_TTL_SEC window
    const rlKey = `mfa:rl:${admin.id}`;
    const count = await this.redis.client.incr(rlKey);
    if (count === 1) await this.redis.client.expire(rlKey, RL_TTL_SEC);
    if (count > RL_MAX) {
      throw new HttpException('Too many OTP requests. Try again later.', HttpStatus.TOO_MANY_REQUESTS);
    }

    // Cooldown: enforce at least COOLDOWN_SEC between sends
    const cdKey = `mfa:cd:${admin.id}`;
    const cd    = await this.redis.client.get(cdKey);
    if (cd) {
      throw new HttpException('Please wait before requesting another OTP.', HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.redis.client.set(cdKey, '1', 'EX', COOLDOWN_SEC);

    // Generate, hash, and store OTP
    const otp  = String(Math.floor(100000 + Math.random() * 900000));
    const hash = await bcrypt.hash(otp, 10);
    await this.redis.client.set(`mfa:otp:${jti}`, hash, 'EX', OTP_TTL_SEC);

    // Send notification and mask destination
    if (method === 'sms') {
      if (!admin.phone) throw new BadRequestException('No phone number on record');
      await this.notifications.sendSms(admin.phone, otp);
      return this.maskPhone(admin.phone);
    } else {
      await this.notifications.sendEmail(admin.email, otp);
      return this.maskEmail(admin.email);
    }
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!domain) return email;
    const visible = local.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(local.length - 2, 3))}@${domain}`;
  }

  private maskPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return `${'*'.repeat(Math.max(digits.length - 4, 0))}${digits.slice(-4)}`;
  }
}
