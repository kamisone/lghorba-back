import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Car } from '../cars/car.entity';
import { RentPosition } from './rent-position.entity';

export enum RentSessionStatus {
  ACTIVE = 'active',
  ENDED = 'ended',
}

@Entity('rent_sessions')
export class RentSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Car, { onDelete: 'CASCADE' })
  car: Car;

  @Column({ type: 'uuid' })
  carId: string;

  @Column({ type: 'enum', enum: RentSessionStatus, default: RentSessionStatus.ACTIVE })
  status: RentSessionStatus;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  endedAt: Date | null;

  @OneToMany(() => RentPosition, (pos) => pos.session)
  positions: RentPosition[];
}
