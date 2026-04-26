import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Car } from './car.entity';

@Entity('car_photos')
export class CarPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Car, { onDelete: 'CASCADE' })
  car: Car;

  @Column({ type: 'uuid' })
  carId: string;

  @Column({ type: 'varchar' })
  objectName: string;

  @CreateDateColumn()
  createdAt: Date;
}
