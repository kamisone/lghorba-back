import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('shop_payment_transactions')
@Index(['orderId'])
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })            orderId: string;
  @Column({ type: 'varchar', length: 50, default: 'stripe' }) provider: string;
  @Column({ type: 'varchar', length: 500 })                   providerTransactionId: string;
  @Column({ type: 'varchar', length: 500, nullable: true, unique: true }) webhookEventId: string | null;

  @Column({ type: 'varchar', length: 30 }) type: 'charge' | 'refund' | 'partial_refund';
  @Column({ type: 'varchar', length: 30 }) status: 'pending' | 'succeeded' | 'failed' | 'cancelled';

  @Column({ type: 'int' }) amountCents: number;
  @Column({ type: 'varchar', length: 10, default: 'EUR' }) currency: string;

  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, unknown> | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
