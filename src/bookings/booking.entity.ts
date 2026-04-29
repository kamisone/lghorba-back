import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn,
} from 'typeorm';
import { Car } from '../cars/car.entity';
import { User } from '../users/user.entity';

export enum BookingStatus {
  PENDING    = 'pending',
  CONFIRMED  = 'confirmed',
  CANCELLED  = 'cancelled',
}

export type BookingSource = 'private' | 'turo' | 'getaround';

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => Car, { onDelete: 'CASCADE' })
  car: Car;

  @Column({ type: 'uuid' })
  carId: string;

  @Column({ type: 'timestamp with time zone' })
  startDateTime: Date;

  @Column({ type: 'timestamp with time zone' })
  endDateTime: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalPrice: number;

  @Column({ type: 'enum', enum: BookingStatus, default: BookingStatus.PENDING })
  status: BookingStatus;

  // ── Source ────────────────────────────────────────────────────────────────
  @Column({ type: 'varchar', default: 'private' })
  source: BookingSource;

  // ── Guest / customer ──────────────────────────────────────────────────────
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  user: User | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', nullable: true })
  customerName: string | null;

  @Column({ type: 'varchar', nullable: true })
  customerEmail: string | null;

  @Column({ type: 'varchar', nullable: true })
  customerPhone: string | null;

  // ── Platform metadata ─────────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  reservationNumber: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  totalEarning: number | null;

  // ── Calendar / tracking ───────────────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  color: string | null;

  @Column({ type: 'boolean', default: false })
  autoStartTracking: boolean;

  /** Incremented automatically on every save — used for optimistic locking. */
  @VersionColumn() version: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
