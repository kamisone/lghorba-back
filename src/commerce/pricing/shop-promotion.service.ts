import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ShopPromotion, PromotionTrigger, PromotionScope, PromotionDiscountType,
} from '../entities/shop-promotion.entity';
import { PromotionCategory } from '../entities/promotion-category.entity';
import { PromotionProduct } from '../entities/promotion-product.entity';

export interface ActivePromotionPublicDto {
  id: string;
  name: string;
  description: string | null;
  discountType: PromotionDiscountType;
  discountValue: number;
  scope: PromotionScope;
  linkedCategoryIds: string[];
  linkedProductIds: string[];
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface CreatePromotionDto {
  name: string;
  description?: string | null;
  trigger: PromotionTrigger;
  code?: string | null;
  discountType: PromotionDiscountType;
  discountValue: number;
  scope?: PromotionScope;
  minOrderCents?: number | null;
  maxUsesTotal?: number | null;
  priority?: number;
  isActive?: boolean;
  startsAt?: string | null;
  expiresAt?: string | null;
}

export type UpdatePromotionDto = Partial<CreatePromotionDto>;

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ShopPromotionService {
  constructor(
    @InjectRepository(ShopPromotion)
    private readonly repo: Repository<ShopPromotion>,
    @InjectRepository(PromotionCategory)
    private readonly catRepo: Repository<PromotionCategory>,
    @InjectRepository(PromotionProduct)
    private readonly prodRepo: Repository<PromotionProduct>,
  ) {}

  // ── Promotion CRUD ────────────────────────────────────────────────────────

  async list(opts: {
    trigger?: PromotionTrigger;
    scope?: PromotionScope;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  } = {}) {
    const { trigger, scope, isActive, limit = 20, offset = 0 } = opts;
    const qb = this.repo.createQueryBuilder('p')
      .orderBy('p.priority', 'DESC')
      .addOrderBy('p.createdAt', 'DESC')
      .take(limit)
      .skip(offset);
    if (trigger  !== undefined) qb.andWhere('p.trigger  = :trigger',  { trigger });
    if (scope    !== undefined) qb.andWhere('p.scope    = :scope',    { scope });
    if (isActive !== undefined) qb.andWhere('p.isActive = :isActive', { isActive });
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async findOne(id: string): Promise<ShopPromotion> {
    const p = await this.repo.findOneBy({ id });
    if (!p) throw new NotFoundException('Promotion not found');
    return p;
  }

  async findOneWithLinks(id: string): Promise<ShopPromotion & {
    categoryLinks: PromotionCategory[];
    productLinks:  PromotionProduct[];
  }> {
    const p = await this.repo.findOne({
      where: { id },
      relations: ['categoryLinks', 'categoryLinks.category', 'productLinks', 'productLinks.product'],
    });
    if (!p) throw new NotFoundException('Promotion not found');
    return p as any;
  }

  async create(dto: CreatePromotionDto): Promise<ShopPromotion> {
    this.validateDto(dto);
    if (dto.code) {
      const existing = await this.repo.findOneBy({ code: dto.code });
      if (existing) throw new ConflictException(`Code "${dto.code}" already in use`);
    }
    return this.repo.save(this.repo.create({
      name:          dto.name,
      description:   dto.description ?? null,
      trigger:       dto.trigger,
      code:          dto.trigger === 'coupon' ? (dto.code || null) : null,
      discountType:  dto.discountType,
      discountValue: dto.discountValue ?? 0,
      scope:         dto.scope ?? 'site_wide',
      minOrderCents: dto.minOrderCents ?? null,
      maxUsesTotal:  dto.maxUsesTotal  ?? null,
      priority:      dto.priority      ?? 0,
      isActive:      dto.isActive      ?? true,
      startsAt:      dto.startsAt  ? new Date(dto.startsAt)  : null,
      expiresAt:     dto.expiresAt ? new Date(dto.expiresAt) : null,
    }));
  }

  async update(id: string, dto: UpdatePromotionDto): Promise<ShopPromotion> {
    const p = await this.findOne(id);
    if (dto.trigger !== undefined && dto.trigger !== p.trigger) {
      this.validateDto({ ...p, ...dto } as CreatePromotionDto);
    }
    if (dto.code && dto.code !== p.code) {
      const conflict = await this.repo.findOneBy({ code: dto.code });
      if (conflict) throw new ConflictException('Code already in use');
    }
    // Force code null when switching to automatic
    const code = dto.trigger === 'automatic' ? null
      : dto.code !== undefined ? (dto.code || null)
      : p.code;

    Object.assign(p, {
      ...dto,
      code,
      discountType:  dto.discountType  ?? p.discountType,
      discountValue: dto.discountValue ?? p.discountValue,
      startsAt:  dto.startsAt  !== undefined ? (dto.startsAt  ? new Date(dto.startsAt)  : null) : p.startsAt,
      expiresAt: dto.expiresAt !== undefined ? (dto.expiresAt ? new Date(dto.expiresAt) : null) : p.expiresAt,
    });
    return this.repo.save(p);
  }

  async remove(id: string): Promise<void> {
    const p = await this.findOne(id);
    await this.repo.remove(p);
  }

  // ── Category links ────────────────────────────────────────────────────────

  async listCategoryLinks(promotionId: string): Promise<PromotionCategory[]> {
    await this.findOne(promotionId);
    return this.catRepo.find({
      where: { promotionId },
      relations: ['category'],
      order: { categoryId: 'ASC' },
    });
  }

  async addCategoryLink(promotionId: string, categoryId: string): Promise<PromotionCategory> {
    const p = await this.findOne(promotionId);
    if (p.scope !== 'category') throw new BadRequestException('Promotion scope must be "category" to add category links');
    const existing = await this.catRepo.findOneBy({ promotionId, categoryId });
    if (existing) return this.catRepo.findOne({ where: { id: existing.id }, relations: ['category'] }) as any;
    const link = await this.catRepo.save(this.catRepo.create({ promotionId, categoryId }));
    return this.catRepo.findOne({ where: { id: link.id }, relations: ['category'] }) as any;
  }

  async removeCategoryLink(promotionId: string, linkId: string): Promise<void> {
    const link = await this.catRepo.findOneBy({ id: linkId, promotionId });
    if (!link) throw new NotFoundException('Category link not found');
    await this.catRepo.remove(link);
  }

  // ── Product links ─────────────────────────────────────────────────────────

  async listProductLinks(promotionId: string): Promise<PromotionProduct[]> {
    await this.findOne(promotionId);
    return this.prodRepo.find({
      where: { promotionId },
      relations: ['product'],
      order: { productId: 'ASC' },
    });
  }

  async addProductLink(promotionId: string, productId: string): Promise<PromotionProduct> {
    const p = await this.findOne(promotionId);
    if (p.scope !== 'product') throw new BadRequestException('Promotion scope must be "product" to add product links');
    const existing = await this.prodRepo.findOneBy({ promotionId, productId });
    if (existing) return this.prodRepo.findOne({ where: { id: existing.id }, relations: ['product'] }) as any;
    const link = await this.prodRepo.save(this.prodRepo.create({ promotionId, productId }));
    return this.prodRepo.findOne({ where: { id: link.id }, relations: ['product'] }) as any;
  }

  async removeProductLink(promotionId: string, linkId: string): Promise<void> {
    const link = await this.prodRepo.findOneBy({ id: linkId, promotionId });
    if (!link) throw new NotFoundException('Product link not found');
    await this.prodRepo.remove(link);
  }

  // ── Public listing ───────────────────────────────────────────────────────

  async listActiveAutoForPublic(): Promise<ActivePromotionPublicDto[]> {
    const now = new Date();
    const promos = await this.repo.find({
      where: { isActive: true, trigger: 'automatic' },
      order: { priority: 'DESC' },
    });
    const valid = promos.filter(p =>
      (!p.startsAt  || p.startsAt  <= now) &&
      (!p.expiresAt || p.expiresAt >= now) &&
      (p.maxUsesTotal === null || p.usesCount < p.maxUsesTotal),
    );
    if (!valid.length) return [];

    const catPromoIds  = valid.filter(p => p.scope === 'category').map(p => p.id);
    const prodPromoIds = valid.filter(p => p.scope === 'product').map(p => p.id);

    const catLinks  = catPromoIds.length
      ? await this.catRepo.find({ where: { promotionId: In(catPromoIds) } })
      : [];
    const prodLinks = prodPromoIds.length
      ? await this.prodRepo.find({ where: { promotionId: In(prodPromoIds) } })
      : [];

    return valid.map(p => ({
      id:               p.id,
      name:             p.name,
      description:      p.description,
      discountType:     p.discountType,
      discountValue:    p.discountValue,
      scope:            p.scope,
      linkedCategoryIds: catLinks.filter(l => l.promotionId === p.id).map(l => l.categoryId),
      linkedProductIds:  prodLinks.filter(l => l.promotionId === p.id).map(l => l.productId),
    }));
  }

  // ── Validation ────────────────────────────────────────────────────────────

  private validateDto(dto: CreatePromotionDto | UpdatePromotionDto) {
    const trigger = (dto as any).trigger;
    if (trigger === 'coupon' && !(dto as any).code) {
      throw new BadRequestException('A coupon code is required when trigger is "coupon"');
    }
    if (trigger === 'automatic' && (dto as any).code) {
      throw new BadRequestException('Code must be empty when trigger is "automatic"');
    }
    const discountType = (dto as any).discountType;
    const discountValue = (dto as any).discountValue;
    if (discountType && discountType !== 'free_shipping' && (discountValue === undefined || discountValue < 0)) {
      throw new BadRequestException('discountValue must be a non-negative number');
    }
  }
}
