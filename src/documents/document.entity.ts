import {
  Column, CreateDateColumn, Entity, OneToMany,
  PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';

export type DocumentType   = 'invoice' | 'receipt';
export type DocumentStatus = 'draft' | 'issued' | 'paid' | 'void';
export type EntityType     = 'booking' | 'shop_order';

@Entity('documents')
export class Document {
  @PrimaryGeneratedColumn('uuid') id: string;

  // Type discriminators — the document knows what domain produced it
  @Column({ type: 'varchar', length: 20 }) documentType: DocumentType;
  @Column({ type: 'varchar', length: 30 }) entityType: EntityType;
  @Column({ type: 'uuid' })                entityId:   string;

  @Column({ type: 'varchar', length: 30,   nullable: true, unique: true }) documentNumber: string | null;
  @Column({ type: 'varchar', length: 500,  nullable: true }) paymentIntentId: string | null;
  @Column({ type: 'varchar', length: 20,   default: 'issued' }) status: DocumentStatus;

  // ── Customer snapshot ──────────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 300 })            customerEmail: string;
  @Column({ type: 'varchar', length: 300, nullable: true }) customerName: string | null;
  @Column({ type: 'varchar', length: 5,   default: 'fr' }) customerLocale: string;

  // ── Seller snapshot (frozen at generation time) ────────────────────────────
  @Column({ type: 'varchar', length: 300 })                     sellerName: string;
  @Column({ type: 'jsonb' })                                    sellerAddress: Record<string, string>;
  @Column({ type: 'varchar', length: 100, nullable: true })     sellerVatNumber: string | null;
  @Column({ type: 'varchar', length: 50,  nullable: true })     sellerSiret: string | null;

  // ── Delivery / shipping address snapshot ──────────────────────────────────
  @Column({ type: 'jsonb', nullable: true }) deliveryAddress: Record<string, string> | null;

  // ── Financial (all in euro-cents, integers) ───────────────────────────────
  @Column({ type: 'int', default: 0 }) subtotalCents: number;
  @Column({ type: 'int', default: 0 }) deliveryCents: number;  // delivery fee or shipping cost
  @Column({ type: 'int', default: 0 }) discountCents: number;
  @Column({ type: 'int', default: 0 }) taxCents:      number;
  @Column({ type: 'int', default: 0 }) totalCents:    number;
  @Column({ type: 'varchar', length: 100, nullable: true }) couponCode: string | null;

  // ── Tax snapshot ───────────────────────────────────────────────────────────
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 20 }) taxRatePct: number;
  @Column({ type: 'varchar', length: 50,  nullable: true }) taxLabel:   string | null;
  @Column({ type: 'varchar', length: 2,   default: 'FR' }) taxCountry: string;

  // ── Domain context for admin display ─────────────────────────────────────
  // e.g. { carLabel, startDate, endDate } for rentals; null for shop orders
  @Column({ type: 'jsonb', nullable: true }) contextSnapshot: Record<string, unknown> | null;

  // ── PDF & delivery state ───────────────────────────────────────────────────
  @Column({ type: 'varchar', length: 1000, nullable: true }) pdfStoragePath: string | null;
  @Column({ type: 'timestamptz', nullable: true }) pdfGeneratedAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) emailSentAt:    Date | null;
  @Column({ type: 'timestamptz', nullable: true }) issuedAt:       Date | null;

  @OneToMany('DocumentLine', 'document', { cascade: ['insert'] })
  lines: Relation<any>[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
