import {
  Column, CreateDateColumn, Entity,
  OneToMany, PrimaryGeneratedColumn, Relation, UpdateDateColumn,
} from 'typeorm';
import { ParkingOwnerPhone } from './parking-owner-phone.entity';
import { ParkingDocument } from './parking-document.entity';

export type ParkingStatus = 'active' | 'inactive' | 'maintenance' | 'blocked';
export type ParkingType = 'covered' | 'outdoor' | 'underground' | 'garage' | 'street' | 'other';

@Entity('parkings')
export class Parking {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 200 })
  label: string;

  @Column({ type: 'text' })
  address: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city: string | null;

  @Column({ type: 'float', nullable: true })
  latitude: number | null;

  @Column({ type: 'float', nullable: true })
  longitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  monthlyRentEur: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  cautionEur: number | null;

  /** Day of month rent is due (1–31) */
  @Column({ type: 'int', nullable: true })
  paymentDueDay: number | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  ownerName: string | null;

  @Column({ type: 'varchar', length: 30, default: 'active' })
  status: ParkingStatus;

  @Column({ type: 'varchar', length: 50, nullable: true })
  parkingType: ParkingType | null;

  @Column({ type: 'text', nullable: true })
  accessInstructions: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  pedestrianCode: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  gateCode: string | null;

  @Column({ type: 'text', nullable: true })
  dimensionNotes: string | null;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => ParkingOwnerPhone, (p) => p.parking, { cascade: ['insert', 'update'], eager: true })
  ownerPhones: Relation<ParkingOwnerPhone>[];

  @OneToMany(() => ParkingDocument, (d) => d.parking, { cascade: ['insert', 'update'], eager: true })
  documents: Relation<ParkingDocument>[];

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
