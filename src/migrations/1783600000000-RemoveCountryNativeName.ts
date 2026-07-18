import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCountryNativeName1783600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_countries" DROP COLUMN "nativeName"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_countries" ADD "nativeName" VARCHAR(200)`);
  }
}
