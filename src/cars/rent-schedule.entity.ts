import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Car } from './car.entity';

@Entity('rent_schedules')
export class RentSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Car, { onDelete: 'CASCADE' })
  car: Car;

  @Column({ type: 'uuid' })
  carId: string;

  @Column({ type: 'timestamp' })
  fromDate: Date;

  @Column({ type: 'timestamp' })
  toDate: Date;

  @Column({ type: 'varchar', nullable: true })
  guestName: string | null;

  @Column({ type: 'varchar', nullable: true })
  guestNumber: string | null;

  @Column({ type: 'varchar', nullable: true })
  reservationNumber: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  totalEarning: number | null;

  @Column({ type: 'boolean', default: false })
  autoStartTracking: boolean;

  @Column({ type: 'varchar', nullable: true })
  color: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
