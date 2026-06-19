import {
  Column, CreateDateColumn, Entity, Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('commerce_notification_logs')
@Index(['event', 'createdAt'])
@Index(['channel', 'createdAt'])
export class CommerceNotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 60 })
  event: string;

  @Column({ type: 'varchar', length: 10 })
  channel: 'sms' | 'email';

  @Column({ type: 'varchar', length: 300 })
  recipient: string;

  @Column({ type: 'varchar', length: 20, default: 'sent' })
  status: 'sent' | 'failed' | 'skipped';

  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ type: 'varchar', nullable: true })
  orderNumber: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
