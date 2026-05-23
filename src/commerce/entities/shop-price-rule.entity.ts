import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export type PriceRuleType = 'percentage_off' | 'fixed_off' | 'override';
export type PriceRuleScope = 'variant' | 'product' | 'global';

@Entity('shop_price_rules')
@Index(['isActive', 'scope'])
export class ShopPriceRule {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 300 }) name: string;

  // Discount type:
  //   percentage_off — value is basis points (100 = 1%, 2000 = 20%)
  //   fixed_off      — value is cents subtracted from price
  //   override       — value is the exact new price in cents
  @Column({ type: 'varchar', length: 30 }) type: PriceRuleType;
  @Column({ type: 'int' })                 value: number;

  // Scope: which products/variants the rule applies to
  @Column({ type: 'varchar', length: 20, default: 'variant' }) scope: PriceRuleScope;
  @Column({ type: 'uuid', nullable: true }) variantId: string | null;
  @Column({ type: 'uuid', nullable: true }) productId: string | null;

  @Column({ type: 'int', default: 0 }) minQty: number;

  // Higher priority wins when multiple rules match
  @Column({ type: 'int', default: 0 }) priority: number;

  @Column({ type: 'boolean', default: true }) isActive: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true }) startsAt: Date | null;
  @Column({ type: 'timestamp with time zone', nullable: true }) expiresAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
