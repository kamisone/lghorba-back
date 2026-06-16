import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyNameFields1780901200000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE documents    ADD COLUMN IF NOT EXISTS "customerCompanyName" VARCHAR(300) NULL`);
    await qr.query(`ALTER TABLE shop_orders  ADD COLUMN IF NOT EXISTS "customerCompanyName" VARCHAR(300) NULL`);
    await qr.query(`ALTER TABLE bookings     ADD COLUMN IF NOT EXISTS "customerCompanyName" VARCHAR(300) NULL`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE documents    DROP COLUMN IF EXISTS "customerCompanyName"`);
    await qr.query(`ALTER TABLE shop_orders  DROP COLUMN IF EXISTS "customerCompanyName"`);
    await qr.query(`ALTER TABLE bookings     DROP COLUMN IF EXISTS "customerCompanyName"`);
  }
}
