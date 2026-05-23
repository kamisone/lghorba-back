import {
  Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';
import { ShopCustomer } from './shop-customer.entity';
import { PaymentType } from './payment-type.entity';
import { Address } from './address.entity';

export type PaymentMethodStatus = 'active' | 'expired' | 'detached';

/**
 * A tokenized payment method saved to a customer's account.
 *
 * Domain: Payments ← Customers
 * Raw card data is NEVER stored. Only Stripe payment method IDs.
 *
 * Lifecycle:
 *  1. Customer completes a payment → method saved if they opt in
 *  2. Future checkouts offer saved method selection
 *  3. Admin/customer can remove → status = 'detached' + Stripe PM detach call
 *  4. Stripe expiry webhook → status = 'expired'
 *
 * Security:
 *  - providerMethodId is the Stripe pm_xxx ID; never the raw PAN
 *  - billingAddressId references an Address record (immutable once set)
 */
@Entity('shop_user_payment_methods')
@Index(['customerId'])
export class UserPaymentMethod {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  @Index()
  customerId: string;

  @ManyToOne(() => ShopCustomer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customerId' })
  customer: Relation<ShopCustomer>;

  @Column({ type: 'uuid', nullable: true }) paymentTypeId: string | null;

  @ManyToOne(() => PaymentType, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'paymentTypeId' })
  paymentType: Relation<PaymentType> | null;

  /** Stripe: pm_xxx  |  PayPal: BA-xxx  |  etc. */
  @Column({ type: 'varchar', length: 300 })
  @Index({ unique: true })
  providerMethodId: string;

  /** 'stripe' | 'paypal' | 'apple_pay' … matches PaymentType.code */
  @Column({ type: 'varchar', length: 50, default: 'stripe' }) provider: string;

  /** visa | mastercard | amex | discover | none (non-card methods) */
  @Column({ type: 'varchar', length: 30, nullable: true }) cardBrand: string | null;

  /** Last 4 digits — display only */
  @Column({ type: 'char', length: 4, nullable: true }) cardLast4: string | null;

  @Column({ type: 'smallint', nullable: true }) cardExpMonth: number | null;
  @Column({ type: 'smallint', nullable: true }) cardExpYear: number | null;

  /** Billing address for this payment method */
  @Column({ type: 'uuid', nullable: true }) billingAddressId: string | null;

  @ManyToOne(() => Address, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'billingAddressId' })
  billingAddress: Relation<Address> | null;

  /** Only one method per customer can be default */
  @Column({ type: 'boolean', default: false }) isDefault: boolean;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  @Index()
  status: PaymentMethodStatus;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
