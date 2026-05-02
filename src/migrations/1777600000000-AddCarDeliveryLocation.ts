import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCarDeliveryLocation1777600000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE cars
        ADD COLUMN IF NOT EXISTS "parkingAddress"    varchar,
        ADD COLUMN IF NOT EXISTS "parkingLat"        float,
        ADD COLUMN IF NOT EXISTS "parkingLng"        float,
        ADD COLUMN IF NOT EXISTS "deliveryType"      varchar DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS "deliveryRadiusKm"  float,
        ADD COLUMN IF NOT EXISTS "deliveryAddresses" text
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE cars
        DROP COLUMN IF EXISTS "parkingAddress",
        DROP COLUMN IF EXISTS "parkingLat",
        DROP COLUMN IF EXISTS "parkingLng",
        DROP COLUMN IF EXISTS "deliveryType",
        DROP COLUMN IF EXISTS "deliveryRadiusKm",
        DROP COLUMN IF EXISTS "deliveryAddresses"
    `);
  }
}
