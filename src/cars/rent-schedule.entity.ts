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

  @CreateDateColumn()
  createdAt: Date;
}
