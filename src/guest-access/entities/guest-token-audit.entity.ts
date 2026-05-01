import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('guest_token_audit_logs')
export class GuestTokenAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tokenId: string;

  /** e.g. 'open' | 'close' | 'parking' | 'info_viewed' | 'token_created' | 'token_revoked' */
  @Column({ type: 'varchar' })
  action: string;

  @Column({ type: 'boolean' })
  success: boolean;

  @Column({ type: 'varchar', nullable: true })
  failReason: string | null;

  @Column({ type: 'varchar', nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', nullable: true })
  userAgent: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
