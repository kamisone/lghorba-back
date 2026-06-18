import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShippingZoneSurcharges1780901400000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE shop_shipping_zones
        ADD COLUMN IF NOT EXISTS "surchargeCents"              INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "freeShippingThresholdCents"  INT,
        ADD COLUMN IF NOT EXISTS "estimatedDeliveryDays"       VARCHAR(100);
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE shop_shipping_zones
        DROP COLUMN IF EXISTS "estimatedDeliveryDays",
        DROP COLUMN IF EXISTS "freeShippingThresholdCents",
        DROP COLUMN IF EXISTS "surchargeCents";
    `);
  }
}
