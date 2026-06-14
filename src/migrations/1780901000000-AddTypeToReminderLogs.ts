import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTypeToReminderLogs1780901000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "reminder_logs_type_enum" AS ENUM ('pickup', 'return');
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "reminder_logs"
      ADD COLUMN IF NOT EXISTS "type" "reminder_logs_type_enum" NOT NULL DEFAULT 'pickup'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reminder_logs" DROP COLUMN IF EXISTS "type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reminder_logs_type_enum"`);
  }
}
