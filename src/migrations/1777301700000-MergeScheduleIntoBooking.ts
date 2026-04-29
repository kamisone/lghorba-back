import { MigrationInterface, QueryRunner } from 'typeorm';

export class MergeScheduleIntoBooking1777301700000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    // ── Extend bookings table ─────────────────────────────────────────────────
    await qr.query(`
      ALTER TABLE "bookings"
        ADD COLUMN IF NOT EXISTS "source"              VARCHAR      NOT NULL DEFAULT 'private',
        ADD COLUMN IF NOT EXISTS "userId"              UUID         NULL REFERENCES "users"("id") ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS "reservationNumber"   VARCHAR      NULL,
        ADD COLUMN IF NOT EXISTS "totalEarning"        DECIMAL(10,2) NULL,
        ADD COLUMN IF NOT EXISTS "color"               VARCHAR      NULL,
        ADD COLUMN IF NOT EXISTS "autoStartTracking"   BOOLEAN      NOT NULL DEFAULT false
    `);

    await qr.query(`
      ALTER TABLE "bookings"
        ADD CONSTRAINT "bookings_source_check"
        CHECK ("source" IN ('private', 'turo', 'getaround'))
    `);

    // ── Add bookingId to rent_sessions ────────────────────────────────────────
    await qr.query(`
      ALTER TABLE "rent_sessions"
        ADD COLUMN IF NOT EXISTS "bookingId" UUID NULL UNIQUE REFERENCES "bookings"("id") ON DELETE SET NULL
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE "rent_sessions" DROP COLUMN IF EXISTS "bookingId"`);
    await qr.query(`ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_source_check"`);
    await qr.query(`
      ALTER TABLE "bookings"
        DROP COLUMN IF EXISTS "autoStartTracking",
        DROP COLUMN IF EXISTS "color",
        DROP COLUMN IF EXISTS "totalEarning",
        DROP COLUMN IF EXISTS "reservationNumber",
        DROP COLUMN IF EXISTS "userId",
        DROP COLUMN IF EXISTS "source"
    `);
  }
}
