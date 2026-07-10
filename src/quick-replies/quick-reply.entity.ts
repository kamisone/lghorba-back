import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

@Entity('quick_replies')
@Index('IDX_quick_replies_category', ['category'])
@Index('IDX_quick_replies_active', ['isActive'])
export class QuickReply {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
