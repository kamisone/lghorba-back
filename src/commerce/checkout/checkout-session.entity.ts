import {
  Column, CreateDateColumn, Entity, Index,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export type CheckoutStep = 'address' | 'shipping' | 'payment' | 'complete';

@Entity('checkout_sessions')
export class CheckoutSession {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 36 }) cartToken: string;

  @Index()
  @Column({ type: 'uuid', nullable: true }) orderId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'address' }) step: CheckoutStep;

  /** Address form data — does NOT include payment info */
  @Column({ type: 'jsonb', nullable: true }) formSnapshot: Record<string, string> | null;

  @Column({ type: 'varchar', length: 10, default: 'fr' }) locale: string;

  /** Unguessable token for email resume links */
  @Index({ unique: true })
  @Column({ type: 'uuid' }) resumeToken: string;

  @Index()
  @Column({ type: 'timestamptz' }) expiresAt: Date;

  /** Set when Stripe payment webhook confirms success */
  @Column({ type: 'timestamptz', nullable: true }) completedAt: Date | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
