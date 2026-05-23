import {
  Column, CreateDateColumn, Entity, Index, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';
import { Country } from './country.entity';

/**
 * Generic, reusable address record.
 *
 * Domain ownership:
 *  - ShopCustomerAddress stores a FK here (saved address book entries)
 *  - Order still uses JSONB snapshots for immutability at purchase time
 *    but may optionally store the sourceAddressId for auditing
 *  - Future: billing addresses on UserPaymentMethod
 *
 * An address record is never mutated after it is referenced by an order.
 * Customer address updates create a NEW address row and update the FK,
 * preserving historical correctness.
 */
@Entity('shop_addresses')
export class Address {
  @PrimaryGeneratedColumn('uuid') id: string;

  /** Full name (individual) or company contact name */
  @Column({ type: 'varchar', length: 300, nullable: true }) fullName: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true }) company: string | null;

  /** Apartment / suite / unit number */
  @Column({ type: 'varchar', length: 50, nullable: true }) unitNumber: string | null;

  /** Street / building number */
  @Column({ type: 'varchar', length: 50, nullable: true }) streetNumber: string | null;

  @Column({ type: 'varchar', length: 500 }) line1: string;

  @Column({ type: 'varchar', length: 500, nullable: true }) line2: string | null;

  @Column({ type: 'varchar', length: 200 }) city: string;

  /** State / province / region — required in US, CA, AU; optional elsewhere */
  @Column({ type: 'varchar', length: 200, nullable: true }) state: string | null;

  @Column({ type: 'varchar', length: 20 }) postalCode: string;

  /** ISO 3166-1 alpha-2 — FK to shop_countries.isoCode */
  @Column({ type: 'char', length: 2 })
  @Index()
  countryCode: string;

  @ManyToOne(() => Country, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'countryCode', referencedColumnName: 'isoCode' })
  country: Relation<Country> | null;

  @Column({ type: 'varchar', length: 50, nullable: true }) phone: string | null;

  /** Immutable once referenced by an order. Set by service layer. */
  @Column({ type: 'boolean', default: false }) isLocked: boolean;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
