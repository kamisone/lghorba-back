import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Server-side record of an issued refresh token, identified by its `jti`
 * claim. Enables rotation (each use replaces the row and revokes the old
 * one) and reuse detection (a revoked token presented again indicates theft
 * and revokes the whole family for that admin).
 */
@Entity('admin_refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  adminId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedByTokenId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
