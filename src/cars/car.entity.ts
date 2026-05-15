import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Relation,
  UpdateDateColumn,
} from 'typeorm';
import { CarPricing } from './car-pricing.entity';
import { CarDeliveryLocation } from './car-delivery-location.entity';
import { Booking } from '../bookings/booking.entity';

@Entity('cars')
export class Car {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', nullable: false })
  name: string;

  @Column({ type: 'varchar', nullable: false })
  immatriculation: string;

  @Column({ type: 'varchar', nullable: false })
  phoneNumber: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  photo: string | null;

  @Column({ type: 'varchar', nullable: true })
  brand: string | null;

  @Column({ type: 'varchar', nullable: true })
  model: string | null;

  @Column({ type: 'varchar', nullable: true })
  finishing: string | null;

  @Column({ type: 'int', nullable: true })
  modelYear: number | null;

  @Column({ type: 'varchar', nullable: true })
  vehicleType: string | null;

  @Column({ type: 'varchar', nullable: true })
  energy: string | null;

  @Column({ type: 'varchar', nullable: true })
  gearbox: string | null;

  @Column({ type: 'int', nullable: true })
  din: number | null;

  @Column({ type: 'varchar', nullable: true })
  mileage: string | null;

  @Column({ type: 'int', nullable: true })
  numberOfDoors: number | null;

  @Column({ type: 'int', nullable: true })
  numberOfSeats: number | null;

  @Column({ type: 'varchar', nullable: true })
  color: string | null;

  @Column({ type: 'varchar', nullable: true })
  vehicleCondition: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  basePricePerDay: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  basePricePerWeekendDay: number | null;

  /* ── Parking location ─────────────────────────────────────────────────── */

  @Column({ type: 'varchar', nullable: true })
  parkingAddress: string | null;

  @Column({ type: 'float', nullable: true })
  parkingLat: number | null;

  @Column({ type: 'float', nullable: true })
  parkingLng: number | null;

  /* ── Delivery configuration ───────────────────────────────────────────── */

  @Column({ type: 'boolean', default: false })
  deliveryEnabled: boolean;

  /** 'radius' | 'location' — only relevant when deliveryEnabled = true */
  @Column({ type: 'varchar', nullable: true })
  deliveryType: 'radius' | 'location' | null;

  @Column({ type: 'float', nullable: true })
  deliveryRadiusKm: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  deliveryRadiusPrice: number | null;

  /* ── External platform links ─────────────────────────────────────────── */

  @Column({ type: 'varchar', length: 2048, nullable: true })
  turoLink: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  getaroundLink: string | null;

  @OneToMany(() => CarDeliveryLocation, (l) => l.car)
  deliveryLocations: Relation<CarDeliveryLocation>[];

  @OneToMany(() => CarPricing, (p) => p.car)
  pricings: Relation<CarPricing>[];

  @OneToMany(() => Booking, (b) => b.car)
  bookings: Relation<Booking>[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
