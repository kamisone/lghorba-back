import {
  Column, CreateDateColumn, Entity, Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type VendorPayoutStatus = 'pending' | 'transferred' | 'failed';

@Entity('shop_vendor_payouts')
@Index(['vendorId'])
@Index(['orderId'])
@Index(['stripeTransferId'], { unique: true, where: '"stripeTransferId" IS NOT NULL' })
export class ShopVendorPayout {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })                                   vendorId: string;
  @Column({ type: 'uuid' })                                   orderId: string;
  @Column({ type: 'uuid', nullable: true })                   orderItemId: string | null;

  @Column({ type: 'int' })                                    grossCents: number;
  @Column({ type: 'int' })                                    platformFeeCents: number;
  @Column({ type: 'int' })                                    netCents: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' }) status: VendorPayoutStatus;
  @Column({ type: 'varchar', length: 200, nullable: true })   stripeTransferId: string | null;
  @Column({ type: 'text', nullable: true })                   failureReason: string | null;

  @CreateDateColumn() createdAt: Date;
}
