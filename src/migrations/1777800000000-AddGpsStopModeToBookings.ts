import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGpsStopModeToBookings1777800000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS "gpsStopMode" VARCHAR NOT NULL DEFAULT 'auto'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bookings DROP COLUMN IF EXISTS "gpsStopMode"
    `);
  }
}
