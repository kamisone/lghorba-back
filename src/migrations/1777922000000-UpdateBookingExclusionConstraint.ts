import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateBookingExclusionConstraint1777922000000 implements MigrationInterface {
  name = 'UpdateBookingExclusionConstraint1777922000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old constraint and index that only excluded 'cancelled' status.
    // They must be rebuilt to also exclude 'cancelled_payment_timeout' so that
    // a new booking can fill the same slot after a payment-timeout cancellation.
    await queryRunner.query(`
      ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_no_overlap"
    `);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_car_dates"`);

    await queryRunner.query(`
      ALTER TABLE "bookings"
        ADD CONSTRAINT "bookings_no_overlap"
        EXCLUDE USING gist (
          "carId" WITH =,
          tstzrange("startDateTime", "endDateTime", '[)') WITH &&
        )
        WHERE (status NOT IN ('cancelled', 'cancelled_payment_timeout'))
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bookings_car_dates"
        ON "bookings" ("carId", "startDateTime", "endDateTime")
        WHERE (status NOT IN ('cancelled', 'cancelled_payment_timeout'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_no_overlap"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bookings_car_dates"`);

    await queryRunner.query(`
      ALTER TABLE "bookings"
        ADD CONSTRAINT "bookings_no_overlap"
        EXCLUDE USING gist (
          "carId" WITH =,
          tstzrange("startDateTime", "endDateTime", '[)') WITH &&
        )
        WHERE (status != 'cancelled')
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bookings_car_dates"
        ON "bookings" ("carId", "startDateTime", "endDateTime")
        WHERE (status != 'cancelled')
    `);
  }
}
