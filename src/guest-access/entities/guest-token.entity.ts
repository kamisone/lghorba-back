import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type GuestAction = 'open' | 'close' | 'parking';
export const GUEST_ACTIONS: GuestAction[] = ['open', 'close', 'parking'];

export const ACTION_SMS_MAP: Record<GuestAction, string> = {
  open:    'open',
  close:   'close',
  parking: 'parking',
};

@Entity('guest_tokens')
export class GuestToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** SHA-256 hash of the raw bearer token — raw token is never persisted. */
  @Column({ type: 'varchar', unique: true })
  tokenHash: string;

  @Column({ type: 'varchar', nullable: true })
  label: string | null;

  @Column({ type: 'uuid' })
  carId: string;

  @Column({ type: 'uuid', nullable: true })
  bookingId: string | null;

  /** Comma-separated list stored by TypeORM simple-array. */
  @Column({ type: 'simple-array' })
  allowedActions: GuestAction[];

  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid' })
  createdByAdminId: string;

  @Column({ type: 'int', default: 0 })
  usageCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
