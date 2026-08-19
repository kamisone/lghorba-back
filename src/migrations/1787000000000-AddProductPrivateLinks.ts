import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductPrivateLinks1787000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_products" ADD "privateLinks" jsonb NOT NULL DEFAULT '[]'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_products" DROP COLUMN "privateLinks"`);
  }
}
