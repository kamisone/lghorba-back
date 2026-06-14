import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSmsMessageIdsToReminderLogs1780900900000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reminder_logs"
        ADD COLUMN IF NOT EXISTS "smsMessageIds" JSONB NOT NULL DEFAULT '[]'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reminder_logs"
        DROP COLUMN IF EXISTS "smsMessageIds"
    `);
  }
}
