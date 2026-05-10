import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingDiscountFields1777924000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS "promotionId"   UUID,
        ADD COLUMN IF NOT EXISTS "promoCode"     VARCHAR,
        ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(10,2),
        ADD COLUMN IF NOT EXISTS "originalPrice"  DECIMAL(10,2)
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE bookings
        DROP COLUMN IF EXISTS "promotionId",
        DROP COLUMN IF EXISTS "promoCode",
        DROP COLUMN IF EXISTS "discountAmount",
        DROP COLUMN IF EXISTS "originalPrice"
    `);
  }
}
