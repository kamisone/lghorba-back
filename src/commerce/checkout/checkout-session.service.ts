import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { RedisService } from '../../redis/redis.service';
import { CheckoutSession, CheckoutStep } from './checkout-session.entity';

// ── Constants ─────────────────────────────────────────────────────────────────

const SESSION_TTL_DAYS = 7;
const REDIS_TTL_S      = 300; // 5-minute hot cache

const cacheKey = (cartToken: string) => `checkout:session:${cartToken}`;

// ── Input schema ──────────────────────────────────────────────────────────────

export const UpsertCheckoutSessionSchema = z.object({
  cartToken:    z.string().uuid(),
  // See the matching comment on InitiateCheckoutSchema.locale — the
  // storefront supports more locales than this fr/en-only enum allowed,
  // which turned session upserts into an uncaught 500 for other locales.
  locale:       z.string().max(10).optional().default('fr'),
  step:         z.enum(['address', 'shipping', 'payment', 'complete']).optional(),
  orderId:      z.string().uuid().nullish(),
  formSnapshot: z.record(z.string(), z.string()).nullish(),
});
export type UpsertCheckoutSessionDto = z.infer<typeof UpsertCheckoutSessionSchema>;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class CheckoutSessionService {
  private readonly logger = new Logger(CheckoutSessionService.name);

  constructor(
    @InjectRepository(CheckoutSession)
    private readonly repo: Repository<CheckoutSession>,
    private readonly redis: RedisService,
  ) {}

  // ── Find or create ────────────────────────────────────────────────────────

  async findOrCreate(cartToken: string, locale: string): Promise<CheckoutSession> {
    const cached = await this.fromCache(cartToken);
    if (cached) return cached;

    const existing = await this.repo.findOneBy({ cartToken });
    if (existing && existing.expiresAt > new Date() && !existing.completedAt) {
      return this.cacheAndReturn(existing);
    }

    const session = await this.repo.save(this.repo.create({
      cartToken,
      orderId:      null,
      step:         'address' as CheckoutStep,
      formSnapshot: null,
      locale,
      resumeToken:  randomUUID(),
      expiresAt:    this.expiresAt(),
      completedAt:  null,
    }));
    this.logger.log(`Checkout session created for cart ${cartToken}`);
    return this.cacheAndReturn(session);
  }

  // ── Upsert (auto-save from frontend) ─────────────────────────────────────

  async upsert(dto: UpsertCheckoutSessionDto): Promise<CheckoutSession> {
    let session = await this.repo.findOneBy({ cartToken: dto.cartToken });
    if (!session) {
      return this.findOrCreate(dto.cartToken, dto.locale ?? 'fr');
    }

    if (dto.formSnapshot !== undefined) session.formSnapshot = (dto.formSnapshot as Record<string, string>) ?? null;
    if (dto.step         !== undefined) session.step         = dto.step;
    if (dto.orderId      !== undefined) session.orderId      = dto.orderId ?? null;
    if (dto.locale       !== undefined) session.locale       = dto.locale;
    session.expiresAt = this.expiresAt();

    const saved = await this.repo.save(session);
    await this.invalidate(dto.cartToken);
    return this.cacheAndReturn(saved);
  }

  // ── Find by cart token (cache-first) ─────────────────────────────────────

  async findByCartToken(cartToken: string): Promise<CheckoutSession | null> {
    const cached = await this.fromCache(cartToken);
    if (cached) return cached;
    const session = await this.repo.findOneBy({ cartToken });
    if (session) await this.cacheAndReturn(session);
    return session;
  }

  // ── Find by resume token (for email deep links) ───────────────────────────

  async findByResumeToken(resumeToken: string): Promise<CheckoutSession> {
    const session = await this.repo.findOneBy({ resumeToken });
    if (!session)                         throw new NotFoundException('Checkout session not found');
    if (session.expiresAt < new Date())   throw new NotFoundException('Checkout session has expired');
    if (session.completedAt)              throw new NotFoundException('Checkout session already completed');
    return session;
  }

  // ── Mark complete (called from payment webhook) ───────────────────────────

  async markComplete(cartToken: string): Promise<void> {
    await this.repo.update({ cartToken }, { step: 'complete', completedAt: new Date() });
    await this.invalidate(cartToken);
  }

  // ── Expired session cleanup (cron) ────────────────────────────────────────

  async deleteExpired(): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('"expiresAt" < NOW()')
      .execute();
    return result.affected ?? 0;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private expiresAt(): Date {
    return new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);
  }

  private async fromCache(cartToken: string): Promise<CheckoutSession | null> {
    try {
      const raw = await this.redis.client.get(cacheKey(cartToken));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CheckoutSession;
      // Re-hydrate Date fields serialised as strings
      parsed.expiresAt  = new Date(parsed.expiresAt);
      parsed.createdAt  = new Date(parsed.createdAt);
      parsed.updatedAt  = new Date(parsed.updatedAt);
      if (parsed.completedAt) parsed.completedAt = new Date(parsed.completedAt);
      // Treat expired cached sessions as miss
      if (parsed.expiresAt < new Date() || parsed.completedAt) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private async cacheAndReturn(session: CheckoutSession): Promise<CheckoutSession> {
    try {
      await this.redis.client.set(cacheKey(session.cartToken), JSON.stringify(session), 'EX', REDIS_TTL_S);
    } catch {
      // Redis failure must never break the checkout flow
    }
    return session;
  }

  private async invalidate(cartToken: string): Promise<void> {
    try {
      await this.redis.client.del(cacheKey(cartToken));
    } catch {
      // Swallow Redis errors
    }
  }
}
