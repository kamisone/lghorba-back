import {
  Column, Entity, ManyToOne, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { Inspection } from './inspection.entity';

@Entity('inspection_photos')
export class InspectionPhoto {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  inspectionId: string;

  @ManyToOne(() => Inspection, (i) => i.photos, { onDelete: 'CASCADE' })
  inspection: Relation<Inspection>;

  @Column({ type: 'varchar', length: 500 })
  gcsObjectName: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  caption: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  uploadedAt: Date;
}
