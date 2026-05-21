import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, Relation,
} from 'typeorm';
import { Parking } from './parking.entity';

@Entity('parking_owner_phones')
export class ParkingOwnerPhone {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'uuid' })
  parkingId: string;

  @ManyToOne(() => Parking, (p) => p.ownerPhones, { onDelete: 'CASCADE' })
  parking: Relation<Parking>;

  @Column({ type: 'varchar', length: 50 })
  phoneNumber: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn() createdAt: Date;
}
