import {
  Column, CreateDateColumn, Entity, Index,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('support_notification_logs')
@Index(['conversationId', 'createdAt'])
export class SupportNotificationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @Column({ type: 'varchar' })
  notificationType: string; // 'sms'

  @Column({ type: 'varchar' })
  status: string; // 'sent' | 'failed' | 'skipped'

  @Column({ type: 'int', default: 0 })
  retries: number;

  @Column({ type: 'text', nullable: true })
  providerResponse: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
