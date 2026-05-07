import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdminMfaFields1777901000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS phone VARCHAR`);
    await qr.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN NOT NULL DEFAULT false`);
    await qr.query(`ALTER TABLE admins ADD COLUMN IF NOT EXISTS "preferredMfaMethod" VARCHAR NOT NULL DEFAULT 'email'`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE admins DROP COLUMN IF EXISTS "preferredMfaMethod"`);
    await qr.query(`ALTER TABLE admins DROP COLUMN IF EXISTS "mfaEnabled"`);
    await qr.query(`ALTER TABLE admins DROP COLUMN IF EXISTS phone`);
  }
}
