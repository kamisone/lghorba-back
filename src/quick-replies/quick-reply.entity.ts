import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Car } from '../cars/car.entity';

@Entity('quick_replies')
@Index('IDX_quick_replies_category', ['category'])
@Index('IDX_quick_replies_active', ['isActive'])
@Index('IDX_quick_replies_car', ['carId'])
export class QuickReply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Null = global reply (shown for every car); set = only shown on that car's Messages tab.
  @ManyToOne(() => Car, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'carId' })
  car: Car | null;

  @Column({ type: 'uuid', nullable: true })
  carId: string | null;

  @Column({ type: 'varchar', length: 150 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  // Free-form organisational slug (e.g. 'check-in', 'payment'). 'general' by default.
  @Column({ type: 'varchar', length: 64, default: 'general' })
  category: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Copy-to-clipboard telemetry — lets the fleet Replies tab surface most-used replies first.
  @Column({ type: 'int', default: 0 })
  usageCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
