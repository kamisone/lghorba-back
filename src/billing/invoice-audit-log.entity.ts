import {
  Column, CreateDateColumn, Entity,
  ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';

export type AuditAction =
  | 'created_draft'
  | 'issued'
  | 'paid'
  | 'voided'
  | 'pdf_generated'
  | 'email_sent'
  | 'generation_failed';

export type AuditActorType = 'system' | 'admin';

@Entity('invoice_audit_logs')
export class InvoiceAuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => Invoice, { onDelete: 'CASCADE', eager: false })
  invoice: Invoice;

  @Column({ type: 'uuid' }) invoiceId: string;

  @Column({ type: 'varchar' }) action: AuditAction;
  @Column({ type: 'varchar' }) actorType: AuditActorType;
  @Column({ type: 'varchar', nullable: true }) actorId: string | null;

  /** Free-form JSON for additional context (error messages, job IDs, etc.). */
  @Column({ type: 'jsonb', nullable: true }) metadata: Record<string, unknown> | null;

  @CreateDateColumn() createdAt: Date;
}
