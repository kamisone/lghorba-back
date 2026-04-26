import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Car } from '../cars/car.entity';
import { RentSchedule } from '../cars/rent-schedule.entity';
import { User } from '../users/user.entity';
import { RentPosition } from './rent-position.entity';

export enum RentSessionStatus {
  ACTIVE = 'active',
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

  @OneToOne(() => RentSchedule, { nullable: true, onDelete: 'CASCADE', eager: false })
  @JoinColumn()
  schedule: RentSchedule | null;

  @Column({ type: 'uuid', nullable: true, unique: true })
  scheduleId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  user: User | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'enum', enum: RentSessionStatus, default: RentSessionStatus.ACTIVE })
  status: RentSessionStatus;

  @Column({ type: 'boolean', default: false })
  trackingPaused: boolean;

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
