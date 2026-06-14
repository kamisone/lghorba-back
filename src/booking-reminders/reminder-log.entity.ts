import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum ReminderStatus {
  SCHEDULED = 'scheduled',
  SENT      = 'sent',
  FAILED    = 'failed',
  SKIPPED   = 'skipped',
  CANCELLED = 'cancelled',
}

export enum ReminderType {
  PICKUP = 'pickup',
  RETURN = 'return',
}

@Entity('reminder_logs')
export class ReminderLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  bookingId: string;

  @Column({ type: 'timestamp with time zone' })
  scheduledFor: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'enum', enum: ReminderStatus, default: ReminderStatus.SCHEDULED })
  status: ReminderStatus;

  @Column({ type: 'enum', enum: ReminderType, default: ReminderType.PICKUP })
  type: ReminderType;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'int', default: 0 })
  attemptCount: number;

  @Column({ type: 'varchar', nullable: true })
  bullJobId: string | null;

  // ── SMS outcome ───────────────────────────────────────────────────────────

  @Column({ type: 'varchar', nullable: true })
  smsStatus: string | null;

  @Column({ type: 'varchar', nullable: true })
  recipientPhone: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  smsMessageIds: number[];

  @Column({ type: 'text', nullable: true })
  messageBody: string | null;

  @Column({ type: 'text', nullable: true })
  smsError: string | null;

  // ── Email outcome ─────────────────────────────────────────────────────────

  @Column({ type: 'varchar', nullable: true })
  emailStatus: string | null;

  @Column({ type: 'varchar', nullable: true })
  recipientEmail: string | null;

  @Column({ type: 'text', nullable: true })
  emailError: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
