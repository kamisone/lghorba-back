import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
