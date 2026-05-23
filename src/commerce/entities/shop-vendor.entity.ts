import {
  Column, CreateDateColumn, Entity, Index,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export type VendorStatus = 'pending' | 'active' | 'suspended';

// Stripe Connect onboarding state mirrors `account.charges_enabled`
export type VendorPayoutsStatus = 'not_connected' | 'pending' | 'enabled' | 'disabled';

@Entity('shop_vendors')
@Index(['email'], { unique: true })
@Index(['status'])
export class ShopVendor {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 300 }) businessName: string;
  @Column({ type: 'varchar', length: 300, unique: true }) email: string;
  @Column({ type: 'varchar' }) passwordHash: string;

  @Column({ type: 'text', nullable: true })            description: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) logoKey: string | null;
  @Column({ type: 'varchar', length: 500, nullable: true }) website: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' }) status: VendorStatus;

  // Stripe Connect
  @Column({ type: 'varchar', length: 100, nullable: true }) stripeConnectId: string | null;
  @Column({ type: 'varchar', length: 30, default: 'not_connected' }) payoutsStatus: VendorPayoutsStatus;

  // Platform fee in basis points (100 = 1%, default 1000 = 10%)
  @Column({ type: 'int', default: 1000 }) platformFeeBps: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
