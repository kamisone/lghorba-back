import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';
import { Car } from '../../cars/car.entity';
import { MaintenanceType } from './maintenance-type.entity';
import { MaintenanceSupplier } from './maintenance-supplier.entity';

export type MaintenanceStatus =
  | 'planned' | 'scheduled' | 'in_progress'
  | 'waiting_parts' | 'completed' | 'cancelled';

@Entity('maintenance_records')
export class MaintenanceRecord {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  carId: string;

  @ManyToOne(() => Car, { onDelete: 'CASCADE' })
  car: Relation<Car>;

  @Column({ type: 'uuid' })
  maintenanceTypeId: string;

  @ManyToOne(() => MaintenanceType, { onDelete: 'RESTRICT', eager: true })
  maintenanceType: Relation<MaintenanceType>;

  @Column({ type: 'uuid', nullable: true })
  supplierId: string | null;

  @ManyToOne(() => MaintenanceSupplier, { onDelete: 'SET NULL', nullable: true, eager: true })
  supplier: Relation<MaintenanceSupplier> | null;

  /** The VehicleAvailability block created by this maintenance record. */
  @Column({ type: 'uuid', nullable: true })
  vehicleAvailabilityId: string | null;

  @Column({ type: 'varchar', length: 30, default: 'planned' })
  status: MaintenanceStatus;

  @Column({ type: 'varchar', length: 300 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'date', nullable: true })
  scheduledDate: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'int', nullable: true })
  odometerAtServiceKm: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  costEur: number | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  invoiceRef: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
