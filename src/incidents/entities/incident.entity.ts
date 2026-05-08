import {
  Column, CreateDateColumn, Entity, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';
import { Car } from '../../cars/car.entity';
import { IncidentPhoto } from './incident-photo.entity';

export type IncidentType =
  | 'scratch' | 'broken_mirror' | 'warning_light'
  | 'accident' | 'interior_damage' | 'other';

export type IncidentSeverity = 'minor' | 'moderate' | 'major';

@Entity('incidents')
export class Incident {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  carId: string;

  @ManyToOne(() => Car, { onDelete: 'CASCADE' })
  car: Relation<Car>;

  @Column({ type: 'uuid', nullable: true })
  bookingId: string | null;

  @Column({ type: 'uuid', nullable: true })
  inspectionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  maintenanceRecordId: string | null;

  @Column({ type: 'varchar', length: 50 })
  incidentType: IncidentType;

  @Column({ type: 'varchar', length: 20, default: 'minor' })
  severity: IncidentSeverity;

  @Column({ type: 'timestamptz' })
  reportedAt: Date;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'boolean', default: false })
  repairRequired: boolean;

  @OneToMany(() => IncidentPhoto, (p) => p.incident)
  photos: Relation<IncidentPhoto[]>;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
