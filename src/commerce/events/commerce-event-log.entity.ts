import {
  Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn,
} from 'typeorm';
import { CommerceEventName } from './commerce-events';

@Entity('commerce_event_log')
@Index(['eventName', 'createdAt'])
@Index(['entityId'])
export class CommerceEventLog {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Column({ type: 'varchar', length: 200 })           eventName: CommerceEventName;
  @Column({ type: 'uuid', nullable: true })            entityId: string | null;
  @Column({ type: 'jsonb', nullable: true })           payload: Record<string, unknown> | null;
  @Column({ type: 'varchar', length: 200, nullable: true }) source: string | null;
  @Column({ type: 'varchar', length: 20, default: 'success' }) status: 'success' | 'failed';
  @Column({ type: 'text', nullable: true })            error: string | null;

  @CreateDateColumn() createdAt: Date;
}
