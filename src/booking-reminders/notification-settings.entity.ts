import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('notification_settings')
export class NotificationSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true })
  key: string;

  // ── SMS ───────────────────────────────────────────────────────────────────

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'int', default: 60 })
  reminderMinutesBefore: number;

  @Column({ type: 'jsonb', default: '[]' })
  recipientPhones: string[];

  @Column({ type: 'text', nullable: true })
  smsTemplate: string | null;

  // ── Email ─────────────────────────────────────────────────────────────────

  @Column({ type: 'boolean', default: false })
  emailEnabled: boolean;

  @Column({ type: 'jsonb', default: '[]' })
  recipientEmails: string[];

  @Column({ type: 'varchar', nullable: true })
  emailSubject: string | null;

  @Column({ type: 'text', nullable: true })
  emailTemplate: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
