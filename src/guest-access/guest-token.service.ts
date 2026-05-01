import * as crypto from 'crypto';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { RedisService } from '../redis/redis.service';
import { CreateGuestTokenDto } from './dto/create-guest-token.dto';
import { GuestToken, GuestAction } from './entities/guest-token.entity';
import { GuestTokenAuditLog } from './entities/guest-token-audit.entity';

export const GUEST_ACTIONS_QUEUE = 'guest-car-actions';

export interface GuestActionJobData {
  tokenId:   string;
  carId:     string;
  action:    GuestAction;
  ipAddress: string | null;
  userAgent: string | null;
}

/** Per-token: max 10 actions per minute */
const RATE_LIMIT_TOKEN_MAX = 10;
/** Per-IP: max 20 actions per minute */
const RATE_LIMIT_IP_MAX = 20;

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

@Injectable()
export class GuestTokenService {
  constructor(
    @InjectRepository(GuestToken)
    private readonly tokenRepo: Repository<GuestToken>,
    @InjectRepository(GuestTokenAuditLog)
    private readonly auditRepo: Repository<GuestTokenAuditLog>,
    @InjectQueue(GUEST_ACTIONS_QUEUE)
    private readonly queue: Queue<GuestActionJobData>,
    private readonly redis: RedisService,
  ) {}

  async create(dto: CreateGuestTokenDto, adminId: string): Promise<{ token: GuestToken; rawToken: string }> {
    const rawToken  = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);

    const entity = this.tokenRepo.create({
      tokenHash,
      label:            dto.label ?? null,
      carId:            dto.carId,
      bookingId:        dto.bookingId ?? null,
      allowedActions:   dto.allowedActions,
      expiresAt:        new Date(dto.expiresAt),
      revokedAt:        null,
      createdByAdminId: adminId,
      usageCount:       0,
    });

    const saved = await this.tokenRepo.save(entity);

    await this.auditRepo.save(
      this.auditRepo.create({
        tokenId:   saved.id,
        action:    'token_created',
        success:   true,
        failReason: null,
        ipAddress: null,
        userAgent: null,
      }),
    );

    return { token: saved, rawToken };
  }

  async findAllByAdmin(): Promise<GuestToken[]> {
    return this.tokenRepo.find({ order: { createdAt: 'DESC' } });
  }

  async revoke(id: string, adminId: string): Promise<GuestToken> {
    const token = await this.tokenRepo.findOne({ where: { id } });
    if (!token) throw new NotFoundException('Guest token not found');

    token.revokedAt = new Date();
    const saved = await this.tokenRepo.save(token);

    await this.auditRepo.save(
      this.auditRepo.create({
        tokenId:   id,
        action:    'token_revoked',
        success:   true,
        failReason: null,
        ipAddress: null,
        userAgent: null,
      }),
    );

    return saved;
  }

  async getInfo(rawToken: string, ipAddress: string | null): Promise<GuestToken> {
    const token = await this.resolveToken(rawToken);

    await this.auditRepo.save(
      this.auditRepo.create({
        tokenId:    token.id,
        action:     'info_viewed',
        success:    true,
        failReason: null,
        ipAddress,
        userAgent:  null,
      }),
    );

    return token;
  }

  async enqueueAction(
    rawToken: string,
    action: GuestAction,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    const token = await this.resolveToken(rawToken);

    if (!token.allowedActions.includes(action)) {
      await this.recordAudit(token.id, action, false, 'action_not_allowed', ipAddress, userAgent);
      throw new ForbiddenException('Action not allowed for this token');
    }

    await this.checkRateLimit(token.id, ipAddress);

    await this.tokenRepo.increment({ id: token.id }, 'usageCount', 1);

    await this.queue.add(
      'execute-action',
      { tokenId: token.id, carId: token.carId, action, ipAddress, userAgent },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    await this.recordAudit(token.id, action, true, null, ipAddress, userAgent);
  }

  private async resolveToken(rawToken: string): Promise<GuestToken> {
    const hash  = sha256(rawToken);
    const token = await this.tokenRepo.findOne({ where: { tokenHash: hash } });

    if (!token) throw new UnauthorizedException('Invalid token');
    if (token.revokedAt) throw new UnauthorizedException('Token has been revoked');
    if (new Date() > token.expiresAt) throw new UnauthorizedException('Token has expired');

    return token;
  }

  private async checkRateLimit(tokenId: string, ipAddress: string | null): Promise<void> {
    const minute = Math.floor(Date.now() / 60_000);
    const client = this.redis.client;

    const tokenKey = `guest:rl:token:${tokenId}:${minute}`;
    const tokenCount = await client.incr(tokenKey);
    await client.expire(tokenKey, 120);

    if (tokenCount > RATE_LIMIT_TOKEN_MAX) {
      throw new ForbiddenException('Rate limit exceeded for this token');
    }

    if (ipAddress) {
      const ipKey   = `guest:rl:ip:${ipAddress}:${minute}`;
      const ipCount = await client.incr(ipKey);
      await client.expire(ipKey, 120);

      if (ipCount > RATE_LIMIT_IP_MAX) {
        throw new ForbiddenException('Rate limit exceeded for this IP');
      }
    }
  }

  private async recordAudit(
    tokenId:   string,
    action:    string,
    success:   boolean,
    failReason: string | null,
    ipAddress: string | null,
    userAgent: string | null,
  ): Promise<void> {
    await this.auditRepo.save(
      this.auditRepo.create({ tokenId, action, success, failReason, ipAddress, userAgent }),
    );
  }
}
