import {
  Column, CreateDateColumn, Entity, JoinColumn,
  ManyToOne, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { Document } from './document.entity';

@Entity('document_lines')
export class DocumentLine {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' }) documentId: string;
  @ManyToOne(() => Document, (d: Document) => d.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'documentId' })
  document: Relation<Document>;

  @Column({ type: 'varchar', length: 500 }) description: string;
  @Column({ type: 'varchar', length: 200, nullable: true }) sku: string | null;

  // decimal(10,4) supports fractional quantities (e.g. 4.5 rental days)
  @Column({ type: 'numeric', precision: 10, scale: 4 }) quantity: number;
  @Column({ type: 'int' }) unitPriceCents: number;
  @Column({ type: 'int' }) totalCents: number;

  // Optional period dates — used by rental invoice lines for the "du … au …" display
  @Column({ type: 'date', nullable: true }) periodStart: string | null;
  @Column({ type: 'date', nullable: true }) periodEnd:   string | null;

  @Column({ type: 'int', default: 0 }) sortOrder: number;

  @CreateDateColumn() createdAt: Date;
}
