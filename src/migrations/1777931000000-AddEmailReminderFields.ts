import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailReminderFields1777931000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // notification_settings — email fields
    await queryRunner.query(`
      ALTER TABLE "notification_settings"
        ADD COLUMN IF NOT EXISTS "emailEnabled"    BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS "recipientEmails" JSONB   NOT NULL DEFAULT '[]',
        ADD COLUMN IF NOT EXISTS "emailSubject"    VARCHAR,
        ADD COLUMN IF NOT EXISTS "emailTemplate"   TEXT
    `);

    // reminder_logs — restructure outcome columns
    await queryRunner.query(`
      ALTER TABLE "reminder_logs"
        ADD COLUMN IF NOT EXISTS "smsStatus"      VARCHAR,
        ADD COLUMN IF NOT EXISTS "smsError"       TEXT,
        ADD COLUMN IF NOT EXISTS "emailStatus"    VARCHAR,
        ADD COLUMN IF NOT EXISTS "recipientEmail" VARCHAR,
        ADD COLUMN IF NOT EXISTS "emailError"     TEXT
    `);

    // Migrate existing data: copy errorMessage → smsError for failed/sent rows
    await queryRunner.query(`
      UPDATE "reminder_logs"
         SET "smsStatus" = CASE
               WHEN status = 'sent'    THEN 'sent'
               WHEN status = 'failed'  THEN 'failed'
               WHEN status = 'skipped' THEN 'skipped'
               ELSE NULL
             END,
             "smsError" = "errorMessage"
       WHERE status IN ('sent', 'failed', 'skipped')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reminder_logs"
        DROP COLUMN IF EXISTS "smsStatus",
        DROP COLUMN IF EXISTS "smsError",
        DROP COLUMN IF EXISTS "emailStatus",
        DROP COLUMN IF EXISTS "recipientEmail",
        DROP COLUMN IF EXISTS "emailError"
    `);
    await queryRunner.query(`
      ALTER TABLE "notification_settings"
        DROP COLUMN IF EXISTS "emailEnabled",
        DROP COLUMN IF EXISTS "recipientEmails",
        DROP COLUMN IF EXISTS "emailSubject",
        DROP COLUMN IF EXISTS "emailTemplate"
    `);
  }
}
