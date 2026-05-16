import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTuroProfileUrl1777980000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "platformProfileUrl" varchar(2048) NULL
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "platformProfileUrl"`);
  }
}
