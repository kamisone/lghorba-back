import {
  Column, CreateDateColumn, Entity, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { Car } from '../../cars/car.entity';
import { InspectionChecklistItem } from './inspection-checklist-item.entity';
import { InspectionPhoto } from './inspection-photo.entity';

export type InspectionType = 'pre_rental' | 'post_rental' | 'periodic';
export type OverallCondition = 'good' | 'fair' | 'poor';

@Entity('inspections')
export class Inspection {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  carId: string;

  @ManyToOne(() => Car, { onDelete: 'CASCADE' })
  car: Relation<Car>;

  @Column({ type: 'uuid', nullable: true })
  bookingId: string | null;

  @Column({ type: 'varchar', length: 30 })
  inspectionType: InspectionType;

  @Column({ type: 'timestamptz' })
  conductedAt: Date;

  @Column({ type: 'varchar', length: 200, nullable: true })
  conductedBy: string | null;

  @Column({ type: 'int', nullable: true })
  odometerKm: number | null;

  @Column({ type: 'smallint', nullable: true })
  fuelLevelPct: number | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  overallCondition: OverallCondition | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => InspectionChecklistItem, (i) => i.inspection, { cascade: true })
  checklistItems: Relation<InspectionChecklistItem[]>;

  @OneToMany(() => InspectionPhoto, (p) => p.inspection)
  photos: Relation<InspectionPhoto[]>;

  @CreateDateColumn() createdAt: Date;
}
