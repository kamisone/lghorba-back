import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingDateToDatetime1777301400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bookings"
        ADD COLUMN "startDateTime" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN "endDateTime"   TIMESTAMP WITH TIME ZONE
    `);

    await queryRunner.query(`
      UPDATE "bookings"
        SET "startDateTime" = ("startDate"::text || 'T00:00:00Z')::timestamptz,
            "endDateTime"   = ("endDate"::text   || 'T00:00:00Z')::timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
        ALTER COLUMN "startDateTime" SET NOT NULL,
        ALTER COLUMN "endDateTime"   SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
        DROP COLUMN "startDate",
        DROP COLUMN "endDate"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bookings"
        ADD COLUMN "startDate" date,
        ADD COLUMN "endDate"   date
    `);

    await queryRunner.query(`
      UPDATE "bookings"
        SET "startDate" = "startDateTime"::date,
            "endDate"   = "endDateTime"::date
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
        ALTER COLUMN "startDate" SET NOT NULL,
        ALTER COLUMN "endDate"   SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "bookings"
        DROP COLUMN "startDateTime",
        DROP COLUMN "endDateTime"
    `);
  }
}
