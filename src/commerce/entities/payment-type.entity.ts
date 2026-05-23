import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Reference table for payment method types.
 * Seeded/managed by admin; new types added when payment providers are integrated.
 *
 * Domain: Payments
 * Ownership: platform ops team (not customer-mutable)
 *
 * Examples:
 *  - code: 'card'           → Credit / Debit Card (Stripe)
 *  - code: 'sepa_debit'     → SEPA Direct Debit (Stripe)
 *  - code: 'paypal'         → PayPal
 *  - code: 'apple_pay'      → Apple Pay (Stripe)
 *  - code: 'google_pay'     → Google Pay (Stripe)
 *  - code: 'klarna'         → Klarna BNPL
 *  - code: 'bank_transfer'  → Manual bank transfer
 */
@Entity('shop_payment_types')
export class PaymentType {
  @PrimaryGeneratedColumn('uuid') id: string;

  /** Machine-readable code — maps to Stripe payment_method.type */
  @Column({ type: 'varchar', length: 50, unique: true }) code: string;

  /** Human-readable label (localisable via Translation.entity) */
  @Column({ type: 'varchar', length: 200 }) name: string;

  /** GCS key for the payment type logo/icon */
  @Column({ type: 'varchar', length: 500, nullable: true }) iconKey: string | null;

  /** Whether customers can currently select this method at checkout */
  @Column({ type: 'boolean', default: true }) isActive: boolean;

  @Column({ type: 'int', default: 0 }) sortOrder: number;
}
