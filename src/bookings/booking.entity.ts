import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn,
} from 'typeorm';
import { Car } from '../cars/car.entity';
import { User } from '../users/user.entity';

export enum BookingStatus {
  PENDING_PAYMENT           = 'pending_payment',
  PENDING                   = 'pending',
  CONFIRMED                 = 'confirmed',
  CANCELLED                 = 'cancelled',
  CANCELLED_PAYMENT_TIMEOUT = 'cancelled_payment_timeout',
}

export const CANCELLED_STATUSES = [
  BookingStatus.CANCELLED,
  BookingStatus.CANCELLED_PAYMENT_TIMEOUT,
] as const;

export type BookingSource  = 'private' | 'turo' | 'getaround';
export type GpsStopMode    = 'auto' | 'manual';

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

  @Column({ type: 'varchar', default: 'auto' })
  gpsStopMode: GpsStopMode;

  // ── Delivery ──────────────────────────────────────────────────────────────
  @Column({ type: 'boolean', default: false })
  deliveryRequested: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  deliveryFee: number | null;

  @Column({ type: 'varchar', nullable: true })
  deliveryAddress: string | null;

  @Column({ type: 'float', nullable: true })
  deliveryAddressLat: number | null;

  @Column({ type: 'float', nullable: true })
  deliveryAddressLng: number | null;

  @Column({ type: 'varchar', nullable: true, unique: true })
  paymentIntentId: string | null;

  // ── Expiration / cancellation audit ──────────────────────────────────────────
  @Column({ type: 'varchar', nullable: true })
  cancellationReason: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  cancelledAt: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt: Date | null;

  /** Incremented automatically on every save — used for optimistic locking. */
  @VersionColumn() version: number;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
