import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';
import { Order } from '../entities/order.entity';

export type ShopReceiptStatus = 'draft' | 'issued' | 'void';

@Entity('shop_order_receipts')
export class ShopOrderReceipt {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 30, nullable: true, unique: true })
  receiptNumber: string | null; // REC-YYYY-NNNNNN — assigned on issuance

  @Column({ type: 'uuid' }) orderId: string;
  @ManyToOne(() => Order, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'orderId' })
  order: Relation<Order>;

  @Column({ type: 'varchar', length: 500, nullable: true }) paymentIntentId: string | null;

  @Column({ type: 'varchar', length: 20, default: 'draft' }) status: ShopReceiptStatus;

  // ── Customer snapshot ──────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 300 })            customerEmail: string;
  @Column({ type: 'varchar', length: 300, nullable: true }) customerName: string | null;
  @Column({ type: 'varchar', length: 5,   default: 'fr' }) customerLocale: string;

  // ── Seller snapshot (frozen at generation time) ────────────────────────────
  @Column({ type: 'varchar', length: 300 })                   sellerName: string;
  @Column({ type: 'jsonb' })                                  sellerAddress: Record<string, string>;
  @Column({ type: 'varchar', length: 100, nullable: true })   sellerVatNumber: string | null;
  @Column({ type: 'varchar', length: 50,  nullable: true })   sellerSiret: string | null;

  // ── Shipping address snapshot ──────────────────────────────────────────────
  @Column({ type: 'jsonb', nullable: true }) shippingAddress: Record<string, string> | null;

  // ── Financial (cents, integers) ────────────────────────────────────────────
  @Column({ type: 'int', default: 0 }) subtotalCents: number;
  @Column({ type: 'int', default: 0 }) shippingCents: number;
  @Column({ type: 'int', default: 0 }) discountCents: number;
  @Column({ type: 'int', default: 0 }) taxCents: number;
  @Column({ type: 'int', default: 0 }) totalCents: number;

  // ── Tax snapshot ───────────────────────────────────────────────────────────
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 20 }) taxRatePct: number; // e.g. 20.00
  @Column({ type: 'varchar', length: 50, nullable: true }) taxLabel: string | null;
  @Column({ type: 'varchar', length: 2,  default: 'FR' }) taxCountry: string;
  @Column({ type: 'varchar', length: 50, nullable: true }) couponCode: string | null;

  // ── PDF & delivery ─────────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 1000, nullable: true }) pdfStoragePath: string | null;
  @Column({ type: 'timestamptz', nullable: true }) pdfGeneratedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) emailSentAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) issuedAt: Date | null;

  @OneToMany('ShopOrderReceiptLine', 'receipt', { cascade: ['insert'] })
  lines: Relation<any>[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
