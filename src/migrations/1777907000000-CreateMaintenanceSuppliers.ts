import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMaintenanceSuppliers1777907000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS maintenance_suppliers (
        id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        name        VARCHAR(200) NOT NULL,
        address     VARCHAR(500) NULL,
        phone       VARCHAR(50)  NULL,
        email       VARCHAR(200) NULL,
        specialty   VARCHAR(200) NULL,
        notes       TEXT         NULL,
        "createdAt" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ  NOT NULL DEFAULT now()
      )
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS maintenance_suppliers`);
  }
}
