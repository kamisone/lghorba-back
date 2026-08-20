import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderTikTokFields1787100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_orders" ADD "tiktokClickId" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "shop_orders" ADD "tiktokBrowserId" varchar(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_orders" DROP COLUMN "tiktokBrowserId"`);
    await queryRunner.query(`ALTER TABLE "shop_orders" DROP COLUMN "tiktokClickId"`);
  }
}
