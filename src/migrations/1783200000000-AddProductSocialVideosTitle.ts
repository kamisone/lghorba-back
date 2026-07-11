import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductSocialVideosTitle1783200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_products" ADD "socialVideosTitle" character varying(300)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_products" DROP COLUMN "socialVideosTitle"`);
  }
}
