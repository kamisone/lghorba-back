import {
  Column, CreateDateColumn, Entity, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Booking } from '../bookings/booking.entity';
import { InvoiceLine } from './invoice-line.entity';

export enum InvoiceStatus {
  DRAFT  = 'draft',
  ISSUED = 'issued',
  PAID   = 'paid',
  VOID   = 'void',
}

@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn('uuid') id: string;

  /** Sequential, non-editable. NULL until transition to issued. */
  @Column({ type: 'varchar', nullable: true, unique: true })
  invoiceNumber: string | null;

  @ManyToOne(() => Booking, { onDelete: 'RESTRICT', eager: false })
  booking: Booking;

  @Column({ type: 'uuid' })
  bookingId: string;

  /** Stripe PaymentIntent ID — traceability between payment and invoice. */
  @Column({ type: 'varchar', nullable: true })
  paymentIntentId: string | null;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  // ── Financial amounts (in euros, snapshotted) ────────────────────────────
  @Column({ type: 'decimal', precision: 12, scale: 2 }) subtotalAmount: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) taxAmount: number;
  @Column({ type: 'decimal', precision: 12, scale: 2 }) totalAmount: number;
  @Column({ type: 'varchar', length: 3, default: 'EUR' }) currency: string;

  // ── Tax snapshot (immutable after issuance) ───────────────────────────────
  @Column({ type: 'decimal', precision: 6, scale: 4 }) taxRateSnapshot: number;
  @Column({ type: 'varchar' }) taxRateLabel: string;
  @Column({ type: 'varchar', length: 2 }) taxCountry: string;

  // ── Snapshotted customer info ─────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true }) customerName: string | null;
  @Column({ type: 'varchar', nullable: true }) customerEmail: string | null;

  // ── Snapshotted seller info ───────────────────────────────────────────────
  @Column({ type: 'varchar' }) sellerName: string;
  @Column({ type: 'jsonb' }) sellerAddress: Record<string, string>;
  @Column({ type: 'varchar', nullable: true }) sellerVatNumber: string | null;
  @Column({ type: 'varchar', nullable: true }) sellerSiret: string | null;

  // ── Lifecycle timestamps ──────────────────────────────────────────────────
  @Column({ type: 'timestamp with time zone', nullable: true }) issuedAt: Date | null;
  @Column({ type: 'timestamp with time zone', nullable: true }) paidAt: Date | null;
  @Column({ type: 'timestamp with time zone', nullable: true }) voidedAt: Date | null;

  // ── PDF / delivery state ──────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true }) pdfStoragePath: string | null;
  @Column({ type: 'timestamp with time zone', nullable: true }) pdfGeneratedAt: Date | null;
  @Column({ type: 'timestamp with time zone', nullable: true }) emailSentAt: Date | null;

  @OneToMany(() => InvoiceLine, l => l.invoice, { cascade: ['insert'] })
  lines: InvoiceLine[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
