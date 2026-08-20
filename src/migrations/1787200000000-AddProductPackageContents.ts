import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductPackageContents1787200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_products" ADD "packageContents" jsonb NOT NULL DEFAULT '[]'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_products" DROP COLUMN "packageContents"`);
  }
}
