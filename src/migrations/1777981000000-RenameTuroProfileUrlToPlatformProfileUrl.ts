import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameTuroProfileUrlToPlatformProfileUrl1777981000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE "users"
        RENAME COLUMN "turoProfileUrl" TO "platformProfileUrl"
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE "users"
        RENAME COLUMN "platformProfileUrl" TO "turoProfileUrl"
    `);
  }
}
