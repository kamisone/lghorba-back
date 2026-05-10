import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Booking } from '../bookings/booking.entity';
import { Promotion, PromotionType } from './promotion.entity';
import { PromotionUsage } from './promotion-usage.entity';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/create-promotion.dto';

// ── Public result shapes ────────────────────────────────────────────────────

export interface DiscountPreview {
  valid:          true;
  promotionId:    string;
  code:           string | null;
  name:           string;
  type:           PromotionType;
  discountAmount: number;
  finalPrice:     number;
}

export interface DiscountError {
  valid:   false;
  error:   string;
}

export type CouponValidationResult = DiscountPreview | DiscountError;

// ── Validation params ───────────────────────────────────────────────────────

export interface CouponParams {
  code:          string;
  carId:         string;
  subtotal:      number;
  deliveryFee:   number;
  days:          number;
  userId?:       string | null;
  customerEmail?: string | null;
}

// ── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class PromotionsService {
  private readonly logger = new Logger(PromotionsService.name);

  constructor(
    @InjectRepository(Promotion)
    private readonly promoRepo: Repository<Promotion>,
    @InjectRepository(PromotionUsage)
    private readonly usageRepo: Repository<PromotionUsage>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
  ) {}

  // ── Admin CRUD ─────────────────────────────────────────────────────────────

  async findAll(): Promise<Promotion[]> {
    return this.promoRepo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Promotion> {
    const p = await this.promoRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Promotion ${id} not found`);
    return p;
  }

  async create(dto: CreatePromotionDto): Promise<Promotion> {
    const promo = this.promoRepo.create({
      ...dto,
      code:      dto.code ?? null,
      startsAt:  dto.startsAt  ? new Date(dto.startsAt)  : null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    });
    return this.promoRepo.save(promo);
  }

  async update(id: string, dto: UpdatePromotionDto): Promise<Promotion> {
    const existing = await this.findOne(id);
    const update: Partial<Promotion> = {};
    if (dto.name                !== undefined) update.name                = dto.name;
    if (dto.description         !== undefined) update.description         = dto.description ?? null;
    if (dto.type                !== undefined) update.type                = dto.type;
    if (dto.value               !== undefined) update.value               = dto.value;
    if (dto.isActive            !== undefined) update.isActive            = dto.isActive;
    if (dto.isAutomatic         !== undefined) update.isAutomatic         = dto.isAutomatic;
    if (dto.isStackable         !== undefined) update.isStackable         = dto.isStackable;
    if (dto.isFirstBookingOnly  !== undefined) update.isFirstBookingOnly  = dto.isFirstBookingOnly;
    if (dto.maxUsages           !== undefined) update.maxUsages           = dto.maxUsages ?? null;
    if (dto.maxUsagesPerCustomer !== undefined) update.maxUsagesPerCustomer = dto.maxUsagesPerCustomer ?? null;
    if (dto.minBookingAmount    !== undefined) update.minBookingAmount    = dto.minBookingAmount ?? null;
    if (dto.minBookingDays      !== undefined) update.minBookingDays      = dto.minBookingDays ?? null;
    if (dto.maxDiscountAmount   !== undefined) update.maxDiscountAmount   = dto.maxDiscountAmount ?? null;
    if (dto.applicableCarIds    !== undefined) update.applicableCarIds    = dto.applicableCarIds ?? null;
    if (dto.code      !== undefined) update.code      = dto.code ?? null;
    if (dto.startsAt  !== undefined) update.startsAt  = dto.startsAt  ? new Date(dto.startsAt)  : null;
    if (dto.expiresAt !== undefined) update.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    await this.promoRepo.save({ ...existing, ...update });
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.promoRepo.delete(id);
  }

  async findUsages(promotionId: string): Promise<PromotionUsage[]> {
    await this.findOne(promotionId);
    return this.usageRepo.find({
      where: { promotionId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Public coupon preview (no locking — UX only) ───────────────────────────

  async previewCoupon(params: CouponParams): Promise<CouponValidationResult> {
    const code = params.code.toUpperCase().trim();
    const promotion = await this.promoRepo.findOne({ where: { code, isActive: true } });

    const check = await this.validatePromoRules(promotion, params, null);
    if (check !== null) return { valid: false, error: check };

    const discountAmount = this.computeDiscount(promotion!, params.subtotal, params.deliveryFee);
    const finalPrice     = Math.max(0, Math.round((params.subtotal + params.deliveryFee - discountAmount) * 100) / 100);

    return {
      valid:          true,
      promotionId:    promotion!.id,
      code:           promotion!.code,
      name:           promotion!.name,
      type:           promotion!.type,
      discountAmount: Math.round(discountAmount * 100) / 100,
      finalPrice,
    };
  }

  // ── Transactional apply (inside booking transaction, with pessimistic lock) ─

  async applyPromoInTx(
    manager:   EntityManager,
    params:    CouponParams,
  ): Promise<{ promotionId: string; discountAmount: number }> {
    const code = params.code.toUpperCase().trim();

    const promotion = await manager
      .getRepository(Promotion)
      .createQueryBuilder('p')
      .where('p.code = :code AND p.isActive = true', { code })
      .setLock('pessimistic_write')
      .getOne();

    const usageRepo = manager.getRepository(PromotionUsage);
    const error = await this.validatePromoRules(promotion, params, usageRepo);
    if (error !== null) throw new BadRequestException(error);

    const discountAmount = this.computeDiscount(promotion!, params.subtotal, params.deliveryFee);
    return { promotionId: promotion!.id, discountAmount: Math.round(discountAmount * 100) / 100 };
  }

  async recordUsageInTx(
    manager: EntityManager,
    data: {
      promotionId:   string;
      bookingId:     string;
      userId:        string | null;
      customerEmail: string | null;
      discountAmount: number;
      originalAmount: number;
    },
  ): Promise<void> {
    await manager.getRepository(PromotionUsage).save(
      manager.getRepository(PromotionUsage).create(data),
    );
    await manager.getRepository(Promotion).increment({ id: data.promotionId }, 'usageCount', 1);
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private computeDiscount(
    promo:       Promotion,
    subtotal:    number,
    deliveryFee: number,
  ): number {
    const total = subtotal + deliveryFee;
    switch (promo.type) {
      case 'percentage': {
        const pct = Math.min(100, Math.max(0, Number(promo.value)));
        const raw = total * pct / 100;
        const cap = promo.maxDiscountAmount != null ? Number(promo.maxDiscountAmount) : Infinity;
        return Math.min(raw, cap, total);
      }
      case 'fixed_amount':
        return Math.min(Number(promo.value), total);
      case 'free_delivery':
        return Math.min(deliveryFee, total);
    }
  }

  // Returns null if valid, otherwise an error message string.
  private async validatePromoRules(
    promotion:  Promotion | null,
    params:     CouponParams,
    usageRepo:  Repository<PromotionUsage> | null,
  ): Promise<string | null> {
    if (!promotion) return 'Coupon code is invalid or inactive';

    const now = new Date();
    if (promotion.startsAt  && promotion.startsAt  > now) return 'This promotion is not yet active';
    if (promotion.expiresAt && promotion.expiresAt < now) return 'This coupon has expired';

    const minAmount = promotion.minBookingAmount != null ? Number(promotion.minBookingAmount) : null;
    if (minAmount !== null && (params.subtotal + params.deliveryFee) < minAmount) {
      return `A minimum booking amount of €${minAmount.toFixed(2)} is required`;
    }

    if (promotion.minBookingDays != null && params.days < promotion.minBookingDays) {
      return `A minimum booking duration of ${promotion.minBookingDays} day(s) is required`;
    }

    if (promotion.applicableCarIds?.length && !promotion.applicableCarIds.includes(params.carId)) {
      return 'This coupon is not valid for the selected vehicle';
    }

    if (promotion.maxUsages != null) {
      const repo    = usageRepo ?? this.usageRepo;
      const count   = await repo.count({ where: { promotionId: promotion.id } });
      if (count >= promotion.maxUsages) return 'This coupon has reached its usage limit';
    }

    if (promotion.maxUsagesPerCustomer != null && params.customerEmail) {
      const repo = usageRepo ?? this.usageRepo;
      const customerCount = await repo.count({
        where: { promotionId: promotion.id, customerEmail: params.customerEmail },
      });
      if (customerCount >= promotion.maxUsagesPerCustomer) {
        return 'You have already used this coupon the maximum number of times';
      }
    }

    if (promotion.isFirstBookingOnly && params.customerEmail) {
      const priorCount = await this.bookingRepo.count({ where: { userId: params.userId ?? undefined } });
      if (priorCount > 0) return 'This coupon is only valid for your first booking';
    }

    return null;
  }
}
