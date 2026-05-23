import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShopPriceRule } from '../entities/shop-price-rule.entity';

export interface CreatePriceRuleDto {
  name: string;
  type: 'percentage_off' | 'fixed_off' | 'override';
  value: number;
  scope?: 'variant' | 'product' | 'global';
  variantId?: string | null;
  productId?: string | null;
  minQty?: number;
  priority?: number;
  isActive?: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
}

@Injectable()
export class PriceRuleService {
  constructor(
    @InjectRepository(ShopPriceRule)
    private readonly repo: Repository<ShopPriceRule>,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async list(): Promise<ShopPriceRule[]> {
    return this.repo.find({ order: { priority: 'DESC', createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<ShopPriceRule> {
    const rule = await this.repo.findOneBy({ id });
    if (!rule) throw new NotFoundException(`Price rule ${id} not found`);
    return rule;
  }

  async create(dto: CreatePriceRuleDto): Promise<ShopPriceRule> {
    this.validateValue(dto.type, dto.value);
    return this.repo.save(this.repo.create({
      name:      dto.name,
      type:      dto.type,
      value:     dto.value,
      scope:     dto.scope ?? 'variant',
      variantId: dto.variantId ?? null,
      productId: dto.productId ?? null,
      minQty:    dto.minQty ?? 0,
      priority:  dto.priority ?? 0,
      isActive:  dto.isActive ?? true,
      startsAt:  dto.startsAt ? new Date(dto.startsAt) : null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    }));
  }

  async update(id: string, dto: Partial<CreatePriceRuleDto>): Promise<ShopPriceRule> {
    const rule = await this.findOne(id);
    if (dto.type !== undefined || dto.value !== undefined) {
      this.validateValue(dto.type ?? rule.type, dto.value ?? rule.value);
    }
    Object.assign(rule, {
      ...(dto.name      !== undefined && { name:      dto.name }),
      ...(dto.type      !== undefined && { type:      dto.type }),
      ...(dto.value     !== undefined && { value:     dto.value }),
      ...(dto.scope     !== undefined && { scope:     dto.scope }),
      ...(dto.variantId !== undefined && { variantId: dto.variantId }),
      ...(dto.productId !== undefined && { productId: dto.productId }),
      ...(dto.minQty    !== undefined && { minQty:    dto.minQty }),
      ...(dto.priority  !== undefined && { priority:  dto.priority }),
      ...(dto.isActive  !== undefined && { isActive:  dto.isActive }),
      ...(dto.startsAt  !== undefined && { startsAt:  dto.startsAt ? new Date(dto.startsAt) : null }),
      ...(dto.expiresAt !== undefined && { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }),
    });
    return this.repo.save(rule);
  }

  async remove(id: string): Promise<void> {
    const rule = await this.findOne(id);
    await this.repo.remove(rule);
  }

  // ── Price resolution ──────────────────────────────────────────────────────
  // Returns the effective price in cents for a given variant/product/qty.
  // The highest-priority active rule that matches wins.

  async resolveEffectivePrice(
    variantId: string,
    productId: string,
    basePriceCents: number,
    qty: number = 1,
  ): Promise<number> {
    const now = new Date();

    // Fetch all active rules that could apply to this variant/product
    const rules = await this.repo
      .createQueryBuilder('r')
      .where('r.isActive = true')
      .andWhere('(r.startsAt IS NULL OR r.startsAt <= :now)', { now })
      .andWhere('(r.expiresAt IS NULL OR r.expiresAt >= :now)', { now })
      .andWhere('r.minQty <= :qty', { qty })
      .andWhere(
        '(r.scope = :global OR (r.scope = :product AND r.productId = :productId) OR (r.scope = :variant AND r.variantId = :variantId))',
        { global: 'global', product: 'product', variant: 'variant', productId, variantId },
      )
      .orderBy('r.priority', 'DESC')
      .getMany();

    if (!rules.length) return basePriceCents;

    const winner = rules[0];
    return this.applyRule(winner, basePriceCents);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private applyRule(rule: ShopPriceRule, basePriceCents: number): number {
    switch (rule.type) {
      case 'percentage_off': {
        // value is basis points: 2000 = 20%
        const discount = Math.floor(basePriceCents * rule.value / 10000);
        return Math.max(0, basePriceCents - discount);
      }
      case 'fixed_off':
        return Math.max(0, basePriceCents - rule.value);
      case 'override':
        return Math.max(0, rule.value);
    }
  }

  private validateValue(type: string, value: number): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new BadRequestException('Rule value must be a non-negative integer');
    }
    if (type === 'percentage_off' && value > 10000) {
      throw new BadRequestException('Percentage discount cannot exceed 100% (10000 basis points)');
    }
  }
}
