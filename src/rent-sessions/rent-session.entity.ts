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
import { Booking } from '../bookings/booking.entity';
import { Car } from '../cars/car.entity';
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

  @OneToOne(() => Booking, { nullable: true, onDelete: 'SET NULL', eager: false })
  @JoinColumn()
  booking: Booking | null;

  @Column({ type: 'uuid', nullable: true, unique: true })
  bookingId: string | null;

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

  @Column({ type: 'timestamp with time zone', nullable: true })
  endedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true, default: null })
  lastLocationRequestedAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true, default: null })
  nextLocationAt: Date | null;

  @OneToMany(() => RentPosition, (pos) => pos.session)
  positions: RentPosition[];
}
