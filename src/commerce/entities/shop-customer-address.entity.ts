import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { ShopCustomer } from './shop-customer.entity';
import { Address } from './address.entity';

/**
 * An entry in a customer's saved address book.
 *
 * Domain: Customers ← Address
 *
 * Backward-compatible dual-mode:
 *  - Existing rows: inline fields only (addressId = null)
 *  - New rows: create Address first, set addressId FK, mirror inline fields
 *
 * Orders snapshot address into JSONB at purchase time — this record can be
 * updated without breaking historical order data.
 */
@Entity('shop_customer_addresses')
@Index(['customerId'])
export class ShopCustomerAddress {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) customerId: string;

  @ManyToOne(() => ShopCustomer, 'addresses', { onDelete: 'CASCADE' })
  customer: Relation<ShopCustomer>;

  /** Normalized address reference — null for legacy rows */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  addressId: string | null;

  @ManyToOne(() => Address, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn({ name: 'addressId' })
  address: Relation<Address> | null;

  // ── Inline fields — source of truth when addressId is null ─────────────────
  @Column({ type: 'varchar', length: 300 }) name: string;
  @Column({ type: 'varchar', length: 500 }) line1: string;
  @Column({ type: 'varchar', length: 500, nullable: true }) line2: string | null;
  @Column({ type: 'varchar', length: 200 }) city: string;
  @Column({ type: 'varchar', length: 20 })  zip: string;

  /** ISO 3166-1 alpha-2 */
  @Column({ type: 'varchar', length: 10 })  country: string;

  @Column({ type: 'boolean', default: false }) isDefault: boolean;

  @CreateDateColumn() createdAt: Date;
}
