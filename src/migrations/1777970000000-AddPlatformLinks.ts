import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformLinks1777970000000 implements MigrationInterface {
  name = 'AddPlatformLinks1777970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "cars"
        ADD COLUMN IF NOT EXISTS "turoLink"       varchar(2048) NULL,
        ADD COLUMN IF NOT EXISTS "getaroundLink"  varchar(2048) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN IF EXISTS "turoLink"`);
    await queryRunner.query(`ALTER TABLE "cars" DROP COLUMN IF EXISTS "getaroundLink"`);
  }
}
