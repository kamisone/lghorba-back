import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderMetaCapiFields1783700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_orders" ADD "clientIpAddress" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "shop_orders" ADD "clientUserAgent" text`);
    await queryRunner.query(`ALTER TABLE "shop_orders" ADD "metaClickId" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "shop_orders" ADD "metaBrowserId" varchar(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_orders" DROP COLUMN "metaBrowserId"`);
    await queryRunner.query(`ALTER TABLE "shop_orders" DROP COLUMN "metaClickId"`);
    await queryRunner.query(`ALTER TABLE "shop_orders" DROP COLUMN "clientUserAgent"`);
    await queryRunner.query(`ALTER TABLE "shop_orders" DROP COLUMN "clientIpAddress"`);
  }
}
