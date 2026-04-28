import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a PostgreSQL exclusion constraint that physically prevents two
 * non-cancelled bookings from overlapping for the same car.
 *
 * This is the last line of defence against race conditions — it fires even
 * if the application-level lock (Redis) or transaction isolation
 * (SERIALIZABLE) fail to catch a concurrent insert.
 *
 * Requires the btree_gist extension (standard in every Postgres installation
 * ≥ 9.1 and available on all major managed providers).
 *
 * Also adds a version column to the bookings table for optimistic locking
 * on status updates.
 */
export class AddBookingExclusionConstraint1777301500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // btree_gist enables the equality operator (=) on non-geometric types
    // inside GiST indexes — required for mixing uuid = and range && operators.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);

    // Optimistic-lock version column (starts at 1; incremented on every save).
    await queryRunner.query(`
      ALTER TABLE "bookings"
        ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
    `);

    // Partial exclusion constraint:
    //   • tstzrange("startDateTime", "endDateTime", '[)') = half-open interval
    //     (inclusive start, exclusive end) — standard for date ranges.
    //   • The WHERE clause excludes cancelled bookings so the same slot can
    //     be re-booked after a cancellation.
    await queryRunner.query(`
      ALTER TABLE "bookings"
        ADD CONSTRAINT "bookings_no_overlap"
        EXCLUDE USING gist (
          "carId" WITH =,
          tstzrange("startDateTime", "endDateTime", '[)') WITH &&
        )
        WHERE (status != 'cancelled')
    `);

    // Supporting B-tree index speeds up the availability look-up query.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bookings_car_dates"
        ON "bookings" ("carId", "startDateTime", "endDateTime")
        WHERE (status != 'cancelled')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_car_dates"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_no_overlap"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "version"`);
  }
}
