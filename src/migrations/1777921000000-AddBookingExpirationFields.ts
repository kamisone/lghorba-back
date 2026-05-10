import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookingExpirationFields1777921000000 implements MigrationInterface {
  name = 'AddBookingExpirationFields1777921000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "bookings_status_enum" ADD VALUE IF NOT EXISTS 'cancelled_payment_timeout'
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
        ADD COLUMN IF NOT EXISTS "cancellationReason" character varying,
        ADD COLUMN IF NOT EXISTS "cancelledAt"        TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "expiresAt"          TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bookings_status_expiresAt"
      ON "bookings" ("status", "expiresAt")
      WHERE "status" = 'pending_payment'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_bookings_status_expiresAt"`);
    await queryRunner.query(`
      ALTER TABLE "bookings"
        DROP COLUMN IF EXISTS "expiresAt",
        DROP COLUMN IF EXISTS "cancelledAt",
        DROP COLUMN IF EXISTS "cancellationReason"
    `);
    // PostgreSQL does not support removing enum values; manual recreation needed.
  }
}
