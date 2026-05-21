import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { Parking } from './parking.entity';

export type ParkingDocumentType = 'photo' | 'contract' | 'invoice' | 'other';

@Entity('parking_documents')
export class ParkingDocument {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  parkingId: string;

  @ManyToOne(() => Parking, (p) => p.documents, { onDelete: 'CASCADE' })
  parking: Relation<Parking>;

  @Column({ type: 'varchar', length: 500 })
  gcsKey: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  originalName: string | null;

  @Column({ type: 'varchar', length: 30, default: 'photo' })
  docType: ParkingDocumentType;

  @Column({ type: 'varchar', length: 300, nullable: true })
  caption: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn() createdAt: Date;
}
