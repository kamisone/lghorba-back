import {
  Column, CreateDateColumn, Entity,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export type PromotionType = 'percentage' | 'fixed_amount' | 'free_delivery';

@Entity('promotions')
export class Promotion {
  @PrimaryGeneratedColumn('uuid') id: string;

  /** Coupon code (uppercase). null = automatic (no code required). */
  @Column({ type: 'varchar', nullable: true, unique: true })
  code: string | null;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** 'percentage' | 'fixed_amount' | 'free_delivery' */
  @Column({ type: 'varchar' })
  type: PromotionType;

  /**
   * For 'percentage': value in [0, 100].
   * For 'fixed_amount': EUR amount.
   * For 'free_delivery': ignored (always zeroes delivery fee).
   */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  value: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** true = applied automatically without a code */
  @Column({ type: 'boolean', default: false })
  isAutomatic: boolean;

  /** Whether this can be combined with other promotions */
  @Column({ type: 'boolean', default: false })
  isStackable: boolean;

  @Column({ type: 'boolean', default: false })
  isFirstBookingOnly: boolean;

  @Column({ type: 'timestamp with time zone', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  /** Global redemption cap (null = unlimited) */
  @Column({ type: 'int', nullable: true })
  maxUsages: number | null;

  @Column({ type: 'int', nullable: true })
  maxUsagesPerCustomer: number | null;

  /** Minimum booking subtotal (before discount) required */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  minBookingAmount: number | null;

  @Column({ type: 'int', nullable: true })
  minBookingDays: number | null;

  /** Cap on discount amount for 'percentage' type */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxDiscountAmount: number | null;

  /** null = all cars */
  @Column({ type: 'jsonb', nullable: true })
  applicableCarIds: string[] | null;

  /** Denormalised usage count (authoritative source is promotion_usages) */
  @Column({ type: 'int', default: 0 })
  usageCount: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
