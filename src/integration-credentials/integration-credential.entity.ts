import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Encrypted-at-rest secrets for third-party integrations. No current
 * integration uses this table (product-edit translation runs on free Google
 * Translate, which needs no API key) — kept as inert schema for a future
 * integration that does. Deliberately its own table rather than
 * `platform_settings` — that table is served in full by a `@Public()`
 * endpoint and eagerly cached in-memory, neither of which is safe for a
 * secret.
 */
@Entity('integration_credentials')
export class IntegrationCredential {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  provider: string;

  @Column({ type: 'varchar', length: 24 })
  iv: string;

  @Column({ type: 'varchar', length: 32 })
  authTag: string;

  @Column({ type: 'text' })
  ciphertext: string;

  @Column({ type: 'int', default: 1 })
  keyVersion: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ type: 'timestamp with time zone' })
  updatedAt: Date;
}
