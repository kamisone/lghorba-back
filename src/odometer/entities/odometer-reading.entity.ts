import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { Car } from '../../cars/car.entity';

export type OdometerSource = 'manual' | 'inspection' | 'booking_return';

@Entity('odometer_readings')
export class OdometerReading {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  carId: string;

  @ManyToOne(() => Car, { onDelete: 'CASCADE' })
  car: Relation<Car>;

  @Column({ type: 'int' })
  readingKm: number;

  @Column({ type: 'timestamptz' })
  recordedAt: Date;

  @Column({ type: 'varchar', length: 50, default: 'manual' })
  source: OdometerSource;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  createdBy: string | null;

  @CreateDateColumn() createdAt: Date;
}
