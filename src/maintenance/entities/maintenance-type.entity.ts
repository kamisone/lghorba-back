import {
  Column, CreateDateColumn, Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('maintenance_types')
export class MaintenanceType {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  defaultCostEur: number | null;

  @Column({ type: 'int', nullable: true })
  intervalDays: number | null;

  @Column({ type: 'int', nullable: true })
  intervalKm: number | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn() createdAt: Date;
}
