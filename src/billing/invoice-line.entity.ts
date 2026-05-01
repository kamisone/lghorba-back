import {
  Column, CreateDateColumn, Entity,
  ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { Invoice } from './invoice.entity';

@Entity('invoice_lines')
export class InvoiceLine {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => Invoice, inv => inv.lines, { onDelete: 'CASCADE' })
  invoice: Invoice;

  @Column({ type: 'uuid' }) invoiceId: string;

  @Column({ type: 'varchar' }) description: string;

  /** Number of rental days. */
  @Column({ type: 'decimal', precision: 10, scale: 4 }) quantity: number;

  /** Per-unit TTC price. */
  @Column({ type: 'decimal', precision: 10, scale: 2 }) unitPrice: number;

  /** quantity × unitPrice, rounded to 2 decimals. */
  @Column({ type: 'decimal', precision: 12, scale: 2 }) subtotal: number;

  @Column({ type: 'date', nullable: true }) startDate: string | null;
  @Column({ type: 'date', nullable: true }) endDate: string | null;
  @Column({ type: 'int', default: 0 }) sortOrder: number;

  @CreateDateColumn() createdAt: Date;
}
