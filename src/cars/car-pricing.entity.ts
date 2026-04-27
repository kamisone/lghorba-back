import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Car } from './car.entity';

@Entity('car_pricings')
export class CarPricing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Car, (c) => c.pricings, { onDelete: 'CASCADE' })
  car: Car;

  @Column({ type: 'uuid' })
  carId: string;

  @Column({ type: 'date' })
  startDate: string; // YYYY-MM-DD

  @Column({ type: 'date' })
  endDate: string; // YYYY-MM-DD inclusive

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  pricePerDay: number;

  @Column({ type: 'varchar', nullable: true })
  label: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
