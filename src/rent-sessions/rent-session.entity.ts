import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Car } from '../cars/car.entity';
import { RentSchedule } from '../cars/rent-schedule.entity';
import { RentPosition } from './rent-position.entity';

export enum RentSessionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  ENDED = 'ended',
}

@Entity('rent_sessions')
export class RentSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Car, { onDelete: 'CASCADE' })
  car: Car;

  @Column({ type: 'uuid' })
  carId: string;

  @ManyToOne(() => RentSchedule, { nullable: true, onDelete: 'CASCADE' })
  schedule: RentSchedule | null;

  @Column({ type: 'uuid', nullable: true })
  scheduleId: string | null;

  @Column({ type: 'enum', enum: RentSessionStatus, default: RentSessionStatus.ACTIVE })
  status: RentSessionStatus;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  endedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  lastLocationRequestedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, default: null })
  nextLocationAt: Date | null;

  @OneToMany(() => RentPosition, (pos) => pos.session)
  positions: RentPosition[];
}
