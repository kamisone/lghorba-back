import {
  Column, Entity, Index, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Car } from '../../cars/car.entity';

export type VehicleHealthStatus = 'healthy' | 'warning' | 'critical' | 'unsafe' | 'needs_service';
export const BLOCKING_STATUSES: VehicleHealthStatus[] = ['unsafe', 'critical'];

@Entity('vehicle_health_records')
export class VehicleHealthRecord {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  carId: string;

  @ManyToOne(() => Car, { onDelete: 'CASCADE' })
  car: Car;

  @Column({ type: 'varchar', length: 30, default: 'healthy' })
  status: VehicleHealthStatus;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  lastCheckedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
