import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveBookingCustomerFields1777900000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Create users for private bookings that have name+phone but no userId
    // Uses DISTINCT ON to deduplicate before inserting; skips if user already exists.
    await queryRunner.query(`
      INSERT INTO users (id, name, phone, email, "createdAt", "updatedAt")
      SELECT DISTINCT ON (LOWER("customerName"), LOWER("customerPhone"))
        gen_random_uuid(),
        "customerName",
        "customerPhone",
        "customerEmail",
        NOW(),
        NOW()
      FROM bookings
      WHERE "userId" IS NULL
        AND "customerName" IS NOT NULL
        AND "customerPhone" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM users u
          WHERE LOWER(u.name)  = LOWER(bookings."customerName")
            AND LOWER(u.phone) = LOWER(bookings."customerPhone")
        )
    `);

    // Step 2: Backfill userId on bookings from matched users
    await queryRunner.query(`
      UPDATE bookings b
      SET "userId" = u.id
      FROM users u
      WHERE b."userId" IS NULL
        AND b."customerName" IS NOT NULL
        AND b."customerPhone" IS NOT NULL
        AND LOWER(u.name)  = LOWER(b."customerName")
        AND LOWER(u.phone) = LOWER(b."customerPhone")
    `);

    // Step 3: Drop the now-redundant columns
    await queryRunner.query(`
      ALTER TABLE bookings
        DROP COLUMN IF EXISTS "customerName",
        DROP COLUMN IF EXISTS "customerEmail",
        DROP COLUMN IF EXISTS "customerPhone"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bookings
        ADD COLUMN IF NOT EXISTS "customerName"  VARCHAR NULL,
        ADD COLUMN IF NOT EXISTS "customerEmail" VARCHAR NULL,
        ADD COLUMN IF NOT EXISTS "customerPhone" VARCHAR NULL
    `);
    // Re-populate from linked users (best-effort)
    await queryRunner.query(`
      UPDATE bookings b
      SET "customerName"  = u.name,
          "customerEmail" = u.email,
          "customerPhone" = u.phone
      FROM users u
      WHERE b."userId" = u.id
    `);
  }
}
