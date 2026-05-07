import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Car } from './car.entity';

@Entity('car_delivery_locations')
export class CarDeliveryLocation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Car, { onDelete: 'CASCADE' })
  car: Car;

  @Column({ type: 'uuid' })
  carId: string;

  @Column({ type: 'varchar', length: 200 })
  label: string;

  @Column({ type: 'varchar', length: 500 })
  address: string;

  @Column({ type: 'float' })
  lat: number;

  @Column({ type: 'float' })
  lng: number;

  /** Match radius in km around this location (default 0.5 km). */
  @Column({ type: 'float', default: 0.5 })
  radiusKm: number;

  /** Optional delivery fee for this specific location. */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
