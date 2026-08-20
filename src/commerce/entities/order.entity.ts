import {
  Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, OneToMany, PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';
import { UserPaymentMethod } from './user-payment-method.entity';
import { ShippingMethod } from './shipping-method.entity';

export type OrderStatus =
  | 'draft' | 'pending' | 'awaiting_payment' | 'paid' | 'processing'
  | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

@Entity('shop_orders')
@Index(['status'])
@Index(['customerEmail'])
@Index(['isTestOrder'])
export class Order {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 50, unique: true }) orderNumber: string;
  @Column({ type: 'varchar', length: 20, default: 'pending' }) status: OrderStatus;

  /**
   * Contains at least one test product, so checkout must be refused before
   * payment. Denormalised at order creation as an audit record; the payment gate
   * re-reads live product state rather than trusting this flag.
   */
  @Column({ type: 'boolean', default: false }) isTestOrder: boolean;

  @Column({ type: 'uuid', nullable: true }) userId: string | null;
  @Column({ type: 'uuid', nullable: true }) customerId: string | null;

  @Column({ type: 'varchar', length: 300 })                 customerEmail: string;
  @Column({ type: 'varchar', length: 300, nullable: true }) customerName: string | null;
  @Column({ type: 'varchar', length: 300, nullable: true }) customerCompanyName: string | null;
  @Column({ type: 'varchar', length: 50,  nullable: true }) customerPhone: string | null;

  @Column({ type: 'jsonb' }) shippingAddressSnapshot: Record<string, string>;
  @Column({ type: 'jsonb', nullable: true }) billingAddressSnapshot: Record<string, string> | null;

  @Column({ type: 'int', default: 0 }) subtotalCents: number;
  @Column({ type: 'int', default: 0 }) shippingCents: number;
  @Column({ type: 'int', default: 0 }) categoryDiscountCents: number;
  @Column({ type: 'int', default: 0 }) discountCents: number;
  @Column({ type: 'int', default: 0 }) taxCents: number;
  @Column({ type: 'int', default: 0 }) totalCents: number;

  @Column({ type: 'jsonb', nullable: true }) pricingSnapshot: Record<string, unknown> | null;

  @Column({ type: 'int', default: 1000 }) platformFeeBps: number;

  @Column({ type: 'varchar', length: 100, nullable: true }) couponCode: string | null;
  @Column({ type: 'uuid', nullable: true }) shippingMethodId: string | null;

  @ManyToOne(() => ShippingMethod, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shippingMethodId' })
  shippingMethod: Relation<ShippingMethod> | null;

  /** Saved payment method used for this order */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  paymentMethodId: string | null;

  @ManyToOne(() => UserPaymentMethod, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethod: Relation<UserPaymentMethod> | null;

  /** ISO 639-1 locale captured at checkout (fr | en) — drives email language */
  @Column({ type: 'varchar', length: 10, default: 'fr' }) customerLocale: string;

  @Column({ type: 'uuid', nullable: true, unique: true }) trackingToken: string | null;
  @Column({ type: 'varchar', length: 100, nullable: true }) cartToken: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) paymentIntentId: string | null;
  @Column({ type: 'timestamptz', nullable: true }) reservationExpiresAt: Date | null;
  @Column({ type: 'text', nullable: true }) notes: string | null;

  /* ── Meta Conversions API matching data — captured at checkout, never displayed ── */
  @Column({ type: 'varchar', length: 64, nullable: true }) clientIpAddress: string | null;
  @Column({ type: 'text', nullable: true }) clientUserAgent: string | null;
  /** Meta Click ID (_fbc cookie) — present only if the visitor arrived via a Meta ad */
  @Column({ type: 'varchar', length: 500, nullable: true }) metaClickId: string | null;
  /** Meta Browser ID (_fbp cookie) — set by the pixel base code once loaded */
  @Column({ type: 'varchar', length: 500, nullable: true }) metaBrowserId: string | null;

  /* ── TikTok Events API matching data — captured at checkout, never displayed ── */
  /** TikTok Click ID (ttclid), present only if the visitor arrived via a TikTok ad */
  @Column({ type: 'varchar', length: 500, nullable: true }) tiktokClickId: string | null;
  /** TikTok Browser ID (_ttp cookie) — set by the pixel base code once loaded */
  @Column({ type: 'varchar', length: 500, nullable: true }) tiktokBrowserId: string | null;

  @OneToMany('OrderItem', 'order', { cascade: ['insert'] })
  items: Relation<any>[];

  @OneToMany('OrderStatusHistory', 'order', { cascade: ['insert'] })
  statusHistory: Relation<any>[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
