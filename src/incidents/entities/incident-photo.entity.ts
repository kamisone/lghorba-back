import {
  Column, Entity, ManyToOne, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { Incident } from './incident.entity';

@Entity('incident_photos')
export class IncidentPhoto {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  incidentId: string;

  @ManyToOne(() => Incident, (i) => i.photos, { onDelete: 'CASCADE' })
  incident: Relation<Incident>;

  @Column({ type: 'varchar', length: 500 })
  gcsObjectName: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  caption: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  uploadedAt: Date;
}
