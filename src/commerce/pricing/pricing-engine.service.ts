import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { ShopPromotion } from '../entities/shop-promotion.entity';
import { PromotionCategory } from '../entities/promotion-category.entity';
import { PromotionProduct } from '../entities/promotion-product.entity';

// ── Input / output types ──────────────────────────────────────────────────────

export interface LineItemInput {
  variantId:      string;
  productId:      string;
  categoryIds:    string[];
  quantity:       number;
  unitPriceCents: number;
  /** Product is flagged `freeShipping`: its presence alone makes the order ship free. */
  freeShipping?:  boolean;
}

export interface PricedLine {
  variantId:             string;
  productId:             string;
  quantity:              number;
  unitPriceCents:        number;
  categoryDiscountCents: number;
  lineTotalCents:        number;
  appliedPromotionId:    string | null;
  appliedPromotionName:  string | null;
}

export interface PricingResult {
  lines:                      PricedLine[];
  rawSubtotalCents:           number;
  categoryDiscountCents:      number;
  afterCategorySubtotalCents: number;
  couponDiscountCents:        number;
  totalDiscountCents:         number;
  couponCode:                 string | null;
  appliedCouponPromotionId:   string | null;
  appliedCouponName:          string | null;
  freeShipping:               boolean;
  /**
   * Why shipping is free, so the storefront can explain it rather than just
   * showing a zero. `product` wins the label when several sources apply, because
   * it is the one tied to something the customer can see in their basket.
   */
  freeShippingReason:         'product' | 'promotion' | 'coupon' | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class PricingEngineService {
  constructor(
    @InjectRepository(ShopPromotion)
    private readonly promoRepo: Repository<ShopPromotion>,
    @InjectRepository(PromotionCategory)
    private readonly catRepo: Repository<PromotionCategory>,
    @InjectRepository(PromotionProduct)
    private readonly prodRepo: Repository<PromotionProduct>,
  ) {}

  /**
   * Compute the full pricing breakdown for a set of cart lines.
   *
   * Pipeline:
   *   1. Apply automatic promotions per line (highest-priority / best-discount wins).
   *   2. Apply coupon discount on top of the post-category subtotal.
   *
   * All logic is server-side and deterministic; the client never computes prices.
   */
  async compute(
    lines: LineItemInput[],
    couponCode?: string | null,
  ): Promise<PricingResult> {
    const now = new Date();

    // ── Step 1: Load active automatic promotions ───────────────────────────
    const autoPromos = await this.promoRepo.find({
      where: { isActive: true, trigger: 'automatic' },
      order: { priority: 'DESC' },
    });
    const validAuto = autoPromos.filter(p =>
      (!p.startsAt  || p.startsAt  <= now) &&
      (!p.expiresAt || p.expiresAt >= now) &&
      (p.maxUsesTotal === null || p.usesCount < p.maxUsesTotal),
    );

    // ── Step 2: Load scope data for all valid automatic promotions ─────────
    const catPromoIds  = validAuto.filter(p => p.scope === 'category').map(p => p.id);
    const prodPromoIds = validAuto.filter(p => p.scope === 'product').map(p => p.id);

    const catLinks  = catPromoIds.length
      ? await this.catRepo.find({ where: { promotionId: In(catPromoIds) } })
      : [];
    const prodLinks = prodPromoIds.length
      ? await this.prodRepo.find({ where: { promotionId: In(prodPromoIds) } })
      : [];

    // Build lookup maps
    const promoCategoryIds  = new Map<string, Set<string>>();
    for (const l of catLinks) {
      if (!promoCategoryIds.has(l.promotionId)) promoCategoryIds.set(l.promotionId, new Set());
      promoCategoryIds.get(l.promotionId)!.add(l.categoryId);
    }

    const promoProductIds = new Map<string, Set<string>>();
    for (const l of prodLinks) {
      if (!promoProductIds.has(l.promotionId)) promoProductIds.set(l.promotionId, new Set());
      promoProductIds.get(l.promotionId)!.add(l.productId);
    }

    // ── Step 3: Apply best automatic promotion per line ────────────────────
    let rawSubtotal = 0;
    let totalCategoryDiscount = 0;
    let autoFreeShipping = false;

    // Shipping is charged once per order, not per line, so it is all-or-nothing:
    // the order ships free only when EVERY item carries free shipping. A single
    // product with paid delivery in the basket means normal shipping applies —
    // otherwise adding a 1 € free-shipping item would waive delivery on the
    // whole order.
    const productFreeShipping =
      lines.length > 0 && lines.every((l) => l.freeShipping === true);

    const pricedLines: PricedLine[] = lines.map(line => {
      rawSubtotal += line.unitPriceCents * line.quantity;

      let bestDiscount = 0;
      let bestPromoId: string | null = null;
      let bestPromoName: string | null = null;

      for (const promo of validAuto) {
        // Check scope match
        const matches = this.lineMatchesScope(promo, line, promoCategoryIds, promoProductIds);
        if (!matches) continue;

        if (promo.discountType === 'free_shipping') {
          autoFreeShipping = true;
          continue;
        }

        const lineTotal = line.unitPriceCents * line.quantity;
        const discount  = this.computeDiscount(promo.discountType, promo.discountValue, lineTotal);

        // Higher priority wins; equal priority → higher discount wins
        const thisPriority = promo.priority ?? 0;
        const bestPriority = bestPromoId
          ? (validAuto.find(p => p.id === bestPromoId)?.priority ?? 0)
          : -Infinity;

        if (
          thisPriority > bestPriority ||
          (thisPriority === bestPriority && discount > bestDiscount)
        ) {
          bestDiscount  = discount;
          bestPromoId   = promo.id;
          bestPromoName = promo.name;
        }
      }

      const lineTotal = line.unitPriceCents * line.quantity;
      const clampedDiscount = Math.min(bestDiscount, lineTotal);
      totalCategoryDiscount += clampedDiscount;
      return {
        variantId:             line.variantId,
        productId:             line.productId,
        quantity:              line.quantity,
        unitPriceCents:        line.unitPriceCents,
        categoryDiscountCents: clampedDiscount,
        lineTotalCents:        lineTotal - clampedDiscount,
        appliedPromotionId:    bestPromoId,
        appliedPromotionName:  bestPromoName,
      };
    });

    const afterCategorySubtotal = rawSubtotal - totalCategoryDiscount;

    // ── Step 4: Apply coupon ───────────────────────────────────────────────
    let couponDiscountCents = 0;
    let validCouponCode: string | null = null;
    let appliedCouponPromoId: string | null = null;
    let appliedCouponName: string | null = null;
    let couponFreeShipping = false;

    if (couponCode) {
      const coupon = await this.promoRepo.findOne({
        where: { code: couponCode, isActive: true, trigger: 'coupon' },
      });

      if (
        coupon &&
        (!coupon.startsAt  || coupon.startsAt  <= now) &&
        (!coupon.expiresAt || coupon.expiresAt >= now) &&
        (coupon.maxUsesTotal === null || coupon.usesCount < coupon.maxUsesTotal)
      ) {
        // Load coupon scope data
        const couponCatIds  = coupon.scope === 'category'
          ? new Set((await this.catRepo.find({ where: { promotionId: coupon.id } })).map(l => l.categoryId))
          : new Set<string>();
        const couponProdIds = coupon.scope === 'product'
          ? new Set((await this.prodRepo.find({ where: { promotionId: coupon.id } })).map(l => l.productId))
          : new Set<string>();

        // Compute eligible amount
        let eligibleAmount = 0;
        for (const pl of pricedLines) {
          const line = lines.find(l => l.variantId === pl.variantId)!;
          if (this.lineMatchesScopeRaw(coupon.scope, couponCatIds, couponProdIds, line)) {
            eligibleAmount += pl.lineTotalCents;
          }
        }

        if (coupon.minOrderCents === null || eligibleAmount >= coupon.minOrderCents) {
          if (coupon.discountType === 'free_shipping') {
            couponFreeShipping = eligibleAmount > 0;
          } else {
            couponDiscountCents = this.computeDiscount(coupon.discountType, coupon.discountValue, eligibleAmount);
          }
        }

        if (couponDiscountCents > 0 || couponFreeShipping) {
          validCouponCode      = couponCode;
          appliedCouponPromoId = coupon.id;
          appliedCouponName    = coupon.name;
        }
      }
    }

    const clampedCouponDiscount = Math.min(couponDiscountCents, afterCategorySubtotal);

    return {
      lines:                      pricedLines,
      rawSubtotalCents:           rawSubtotal,
      categoryDiscountCents:      totalCategoryDiscount,
      afterCategorySubtotalCents: afterCategorySubtotal,
      couponDiscountCents:        clampedCouponDiscount,
      totalDiscountCents:         totalCategoryDiscount + clampedCouponDiscount,
      couponCode:                 validCouponCode,
      appliedCouponPromotionId:   appliedCouponPromoId,
      appliedCouponName,
      freeShipping:               productFreeShipping || autoFreeShipping || couponFreeShipping,
      freeShippingReason:         productFreeShipping
        ? 'product'
        : autoFreeShipping
          ? 'promotion'
          : couponFreeShipping
            ? 'coupon'
            : null,
    };
  }

  // ── Product-level badge resolution ───────────────────────────────────────

  async getActiveForProduct(productId: string): Promise<{
    id: string;
    name: string;
    discountType: string;
    discountValue: number;
  } | null> {
    const now = new Date();
    const rows: { categoryId: string }[] = await this.promoRepo.manager.query(
      `SELECT "categoryId" FROM shop_product_category_map WHERE "productId" = $1`,
      [productId],
    );
    const categoryIds = rows.map(r => r.categoryId);

    const autoPromos = await this.promoRepo.find({
      where: { isActive: true, trigger: 'automatic' },
      order: { priority: 'DESC' },
    });
    const valid = autoPromos.filter(p =>
      (!p.startsAt  || p.startsAt  <= now) &&
      (!p.expiresAt || p.expiresAt >= now) &&
      (p.maxUsesTotal === null || p.usesCount < p.maxUsesTotal),
    );

    const catPromoIds  = valid.filter(p => p.scope === 'category').map(p => p.id);
    const prodPromoIds = valid.filter(p => p.scope === 'product').map(p => p.id);
    const catLinks  = catPromoIds.length
      ? await this.catRepo.find({ where: { promotionId: In(catPromoIds) } })
      : [];
    const prodLinks = prodPromoIds.length
      ? await this.prodRepo.find({ where: { promotionId: In(prodPromoIds) } })
      : [];

    for (const promo of valid) {
      const catIds  = new Set(catLinks.filter(l => l.promotionId === promo.id).map(l => l.categoryId));
      const prdIds  = new Set(prodLinks.filter(l => l.promotionId === promo.id).map(l => l.productId));
      const dummy: LineItemInput = { variantId: '', productId, categoryIds, quantity: 1, unitPriceCents: 0 };
      if (this.lineMatchesScopeRaw(promo.scope, catIds, prdIds, dummy)) {
        return { id: promo.id, name: promo.name, discountType: promo.discountType, discountValue: promo.discountValue };
      }
    }
    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private lineMatchesScope(
    promo: ShopPromotion,
    line: LineItemInput,
    promoCategoryIds: Map<string, Set<string>>,
    promoProductIds:  Map<string, Set<string>>,
  ): boolean {
    return this.lineMatchesScopeRaw(
      promo.scope,
      promoCategoryIds.get(promo.id) ?? new Set(),
      promoProductIds.get(promo.id)  ?? new Set(),
      line,
    );
  }

  private lineMatchesScopeRaw(
    scope: string,
    catIds:  Set<string>,
    prodIds: Set<string>,
    line: LineItemInput,
  ): boolean {
    if (scope === 'site_wide') return true;
    if (scope === 'category')  return line.categoryIds.some(c => catIds.has(c));
    if (scope === 'product')   return prodIds.has(line.productId);
    return false;
  }

  private computeDiscount(
    type: string,
    value: number,
    baseAmount: number,
  ): number {
    if (type === 'percentage')   return Math.round(baseAmount * value / 100);
    if (type === 'fixed_amount') return Math.min(value, baseAmount);
    return 0;
  }
}
