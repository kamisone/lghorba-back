import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoiceCustomerLocale1777902000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "customerLocale" VARCHAR(5) NOT NULL DEFAULT 'fr'`);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE invoices DROP COLUMN IF EXISTS "customerLocale"`);
  }
}
