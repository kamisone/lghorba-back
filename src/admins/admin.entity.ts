import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum AdminRole {
  ADMIN = 'admin',
  SUPERADMIN = 'superadmin',
}

export type MfaMethod = 'email' | 'sms';

@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar' })
  password: string;

  @Column({ type: 'enum', enum: AdminRole, default: AdminRole.ADMIN })
  role: AdminRole;

  // ── MFA ───────────────────────────────────────────────────────────────────
  @Column({ type: 'boolean', default: false })
  mfaEnabled: boolean;

  @Column({ type: 'varchar', default: 'email' })
  preferredMfaMethod: MfaMethod;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
