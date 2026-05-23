import {
  Column, CreateDateColumn, Entity, Index,
  OneToMany, PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';

export type PromotionTrigger      = 'automatic' | 'coupon';
export type PromotionScope        = 'site_wide' | 'category' | 'product';
export type PromotionDiscountType = 'percentage' | 'fixed_amount' | 'free_shipping';

/**
 * Unified promotion entity.
 *
 * trigger=automatic → applied without customer input (date-based, category sale, etc.)
 * trigger=coupon    → requires customer to enter `code` at checkout
 *
 * scope=site_wide   → applies to all products
 * scope=category    → applies to products in linked categories (PromotionCategory junction)
 * scope=product     → applies to specific linked products  (PromotionProduct junction)
 */
@Entity('shop_promotions')
export class ShopPromotion {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 300 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;

  // Marketing copy (translatable)
  @Column({ type: 'varchar', length: 255, nullable: true }) marketingLabel: string | null;
  @Column({ type: 'text', nullable: true })                  bannerText: string | null;

  // ── How it is triggered ──────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 20, default: 'automatic' })
  trigger: PromotionTrigger;

  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  @Index()
  code: string | null;

  // ── Discount ─────────────────────────────────────────────────────────────────
  // DB columns remain "type" / "value" to avoid a data migration.
  @Column({ type: 'varchar', length: 30, name: 'type' })
  discountType: PromotionDiscountType;

  @Column({ type: 'int', default: 0, name: 'value' })
  discountValue: number;

  // ── What it applies to ───────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 20, default: 'site_wide' })
  scope: PromotionScope;

  // ── Constraints ──────────────────────────────────────────────────────────────
  @Column({ type: 'int', nullable: true }) minOrderCents: number | null;
  @Column({ type: 'int', nullable: true }) maxUsesTotal: number | null;
  @Column({ type: 'int', default: 0 })    usesCount: number;

  // Higher priority wins when multiple automatic promotions match the same product.
  @Column({ type: 'int', default: 0 }) priority: number;

  @Column({ type: 'boolean', default: true })    isActive: boolean;
  @Column({ type: 'timestamptz', nullable: true }) startsAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) expiresAt: Date | null;

  // ── Relations ────────────────────────────────────────────────────────────────
  // String references prevent circular import issues.
  @OneToMany('PromotionCategory', 'promotion')
  categoryLinks: Relation<any>[];

  @OneToMany('PromotionProduct', 'promotion')
  productLinks: Relation<any>[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
