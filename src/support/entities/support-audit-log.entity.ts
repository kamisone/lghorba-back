import {
  Column, CreateDateColumn, Entity, Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type AuditAction =
  | 'conversation_deleted'
  | 'conversation_archived'
  | 'status_changed'
  | 'assigned'
  | 'auto_closed';

@Entity('support_audit_logs')
@Index(['conversationId', 'createdAt'])
export class SupportAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @Column({ nullable: true })
  adminId: string | null;

  @Column({ type: 'varchar' })
  action: AuditAction;

  @Column({ type: 'jsonb', nullable: true })
  previousValue: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  newValue: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @CreateDateColumn({ type: 'timestamp with time zone' })
  createdAt: Date;
}
