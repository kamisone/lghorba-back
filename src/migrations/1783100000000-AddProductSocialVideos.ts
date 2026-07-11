import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductSocialVideos1783100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_products" ADD "socialVideos" jsonb NOT NULL DEFAULT '[]'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_products" DROP COLUMN "socialVideos"`);
  }
}
