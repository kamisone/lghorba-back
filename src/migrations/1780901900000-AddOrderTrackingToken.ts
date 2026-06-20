import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderTrackingToken1780901900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shop_orders" ADD "trackingToken" uuid`);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_shop_orders_trackingToken" ON "shop_orders" ("trackingToken") WHERE "trackingToken" IS NOT NULL`);
    await queryRunner.query(`UPDATE "shop_orders" SET "trackingToken" = gen_random_uuid() WHERE "trackingToken" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_shop_orders_trackingToken"`);
    await queryRunner.query(`ALTER TABLE "shop_orders" DROP COLUMN "trackingToken"`);
  }
}
