import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameTuroProfileUrlToPlatformProfileUrl1777981000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    // AddTuroProfileUrl was later amended to add the column as "platformProfileUrl" directly,
    // so this rename is a no-op on fresh installs.
    await runner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'users' AND column_name = 'turoProfileUrl'
        ) THEN
          ALTER TABLE "users" RENAME COLUMN "turoProfileUrl" TO "platformProfileUrl";
        END IF;
      END $$
    `);
  }

  async down(_runner: QueryRunner): Promise<void> {
    // No-op: AddTuroProfileUrl owns the column lifecycle (it adds "platformProfileUrl"
    // directly). Reversing this rename here would leave "turoProfileUrl" stranded
    // when AddTuroProfileUrl.down then tries to drop "platformProfileUrl".
  }
}
