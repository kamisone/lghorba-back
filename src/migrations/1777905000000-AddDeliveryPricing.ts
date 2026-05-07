import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryPricing1777905000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // Car: delivery radius price
    await qr.query(`
      ALTER TABLE cars
        ADD COLUMN IF NOT EXISTS "deliveryRadiusPrice" DECIMAL(10,2) NULL
    `);

    // CarDeliveryLocation: per-location price
    await qr.query(`
      ALTER TABLE car_delivery_locations
        ADD COLUMN IF NOT EXISTS "price" DECIMAL(10,2) NULL
    `);

    // Booking: delivery fields
    await qr.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS "deliveryRequested" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "deliveryFee"       DECIMAL(10,2) NULL,
        ADD COLUMN IF NOT EXISTS "deliveryAddress"   VARCHAR NULL,
        ADD COLUMN IF NOT EXISTS "deliveryAddressLat" FLOAT NULL,
        ADD COLUMN IF NOT EXISTS "deliveryAddressLng" FLOAT NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE cars DROP COLUMN IF EXISTS "deliveryRadiusPrice"`);
    await qr.query(`ALTER TABLE car_delivery_locations DROP COLUMN IF EXISTS "price"`);
    await qr.query(`
      ALTER TABLE bookings
        DROP COLUMN IF EXISTS "deliveryRequested",
        DROP COLUMN IF EXISTS "deliveryFee",
        DROP COLUMN IF EXISTS "deliveryAddress",
        DROP COLUMN IF EXISTS "deliveryAddressLat",
        DROP COLUMN IF EXISTS "deliveryAddressLng"
    `);
  }
}
