import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBookingReminders1777930000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "notification_settings" (
        "id"                     SERIAL PRIMARY KEY,
        "key"                    VARCHAR NOT NULL UNIQUE,
        "enabled"                BOOLEAN NOT NULL DEFAULT TRUE,
        "reminderMinutesBefore"  INT     NOT NULL DEFAULT 60,
        "recipientPhones"        JSONB   NOT NULL DEFAULT '[]',
        "smsTemplate"            TEXT,
        "createdAt"              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt"              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "reminder_logs_status_enum" AS ENUM (
        'scheduled', 'sent', 'failed', 'skipped', 'cancelled'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "reminder_logs" (
        "id"             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
        "bookingId"      UUID    NOT NULL,
        "scheduledFor"   TIMESTAMP WITH TIME ZONE NOT NULL,
        "sentAt"         TIMESTAMP WITH TIME ZONE,
        "status"         "reminder_logs_status_enum" NOT NULL DEFAULT 'scheduled',
        "errorMessage"   TEXT,
        "recipientPhone" VARCHAR,
        "messageBody"    TEXT,
        "attemptCount"   INT NOT NULL DEFAULT 0,
        "bullJobId"      VARCHAR,
        "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reminder_logs_bookingId" ON "reminder_logs" ("bookingId")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reminder_logs_status" ON "reminder_logs" ("status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reminder_logs_scheduledFor" ON "reminder_logs" ("scheduledFor")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "reminder_logs"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reminder_logs_status_enum"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_settings"`);
  }
}
